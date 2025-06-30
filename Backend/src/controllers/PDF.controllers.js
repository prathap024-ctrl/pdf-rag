import multer from "multer";
import { ApiResponse } from "../utils/ApiResponse.js";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { ApiError } from "../utils/ApiError.js";
import { llm } from "../Ai-Models/Gemini.js";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { template } from "../prompts/template.js";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { Document } from "@langchain/core/documents";
import { client } from "../db/chromaDB.js";
import { embeddings } from "../Ai-Models/GoogleEmbeddings.js";
import { db } from "../db/db.js";
import { pdfLoad, pdfResponse } from "../schema/schema.js";
import { desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const inputPdf = async (req, res) => {
  try {
    const newPdf = req.file;
    if (!newPdf) {
      throw new ApiError(400, "PDF file not uploaded!");
    }

    const collectionName = `pdf-${uuidv4()}`;
    const inserted = await db
      .insert(pdfLoad)
      .values({
        filename: req.file.originalname,
        size: req.file.size,
        collectionName: collectionName,
      })
      .returning();
    const pdfId = inserted[0].id;
    console.log("Inserted PDF ID:", pdfId);
    console.log("PDF inserted into PostgresQL Table!");
    const loader = new PDFLoader(req.file.path);
    const docs = await loader.load();
    console.log("Docs JSON length:", docs.length);

    //split the loaded pdf content
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const allSplits = await splitter.splitDocuments(docs);
    console.log(`Split blog post into ${allSplits.length} sub-documents.`);
    console.log(`Data embedded Successfully!`);
    const cleanedDocs = allSplits
      .filter((doc) => doc.pageContent && typeof doc.pageContent === "string")
      .map(
        (doc) =>
          new Document({
            pageContent: doc.pageContent,
            metadata: { source: doc.metadata?.source || "unknown" },
          })
      );

    const vectorStore = await Chroma.fromDocuments(cleanedDocs, embeddings, {
      collectionName: collectionName,
      clientParams: client,
    });

    console.log("✅ VectorStore initialized with Google embeddings:");
    console.log("🧠 Embedding model:", vectorStore.embeddings?.modelName);
    console.log(
      "🔢 Collection now contains:",
      await vectorStore.collection.count()
    );
    console.log(
      "✅ GoogleEmbedding dimension:",
      vectorStore.collection.peek({ limit: 738 })
    );
    return res
      .status(200)
      .json(new ApiResponse(200, { pdfId }, "Pdf loaded successfully!"));
  } catch (error) {
    console.error("Error loading PDF:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, "", "Failed to load Pdf!"));
  }
};

const generatePdfResponse = async (req, res) => {
  console.log("Incoming body:", req.body);
  const { userQuestion, pdfId } = req.body;
  console.log("🧪 Question type:", typeof userQuestion);
  console.log("🧪 Question value:", userQuestion);
  const trimmedQuestion = String(userQuestion || "").trim();

  try {
    const [{ collectionName }] = await db
      .select({ collectionName: pdfLoad.collectionName })
      .from(pdfLoad)
      .where(eq(pdfLoad.id, Number(pdfId)));

    if (!collectionName) {
      throw new ApiError(400, "Collection not found for the selected PDF");
    }
    let vectorStore;
    try {
      vectorStore = await Chroma.fromExistingCollection(embeddings, {
        collectionName: collectionName,
        clientParams: client,
      });
    } catch (vectorStoreError) {
      console.error("Vector store connection failed:", vectorStoreError);
      throw new Error("Failed to connect to vector database");
    }

    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["user", template],
    ]);

    // Define state for application
    const StateAnnotation = Annotation.Root({
      question: Annotation,
      context: Annotation,
      answer: Annotation,
    });

    const retrieve = async (state) => {
      try {
        console.log("🔍 Retrieving documents for question:", state.question);

        // Use ChromaDB client directly to avoid LangChain wrapper issues
        const collection = await client.getCollection({
          name: collectionName,
        });

        // Generate embedding for the question using Google embeddings
        const queryEmbedding = await embeddings.embedQuery(state.question);
        console.log(
          "🧮 Generated query embedding with dimensions:",
          queryEmbedding.length
        );

        // Query ChromaDB directly
        const queryResult = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: 4,
        });

        console.log("📊 ChromaDB query result:", queryResult);

        // Convert ChromaDB results to LangChain Document format
        const retrievedDocs = [];
        if (queryResult.documents && queryResult.documents[0]) {
          for (let i = 0; i < queryResult.documents[0].length; i++) {
            const pageContent = queryResult.documents[0][i];
            const metadata = queryResult.metadatas[0][i] || {};

            retrievedDocs.push({
              pageContent: pageContent,
              metadata: metadata,
            });
          }
        }

        console.log(
          "✅ Converted to document format, count:",
          retrievedDocs.length
        );

        return { context: retrievedDocs };
      } catch (retrieveError) {
        console.error("❌ Retrieval failed:", retrieveError);
        throw new ApiError(
          400,
          { context: [] },
          "Failed to retrive the context!"
        );
      }
    };

    const generate = async (state) => {
      try {
        console.log(
          "🤖 Generating response for context:",
          typeof state.context,
          Array.isArray(state.context)
        );

        // Ensure context is an array before calling .map()
        const contextArray = Array.isArray(state.context) ? state.context : [];

        if (contextArray.length === 0) {
          console.log("⚠️ No context documents found");
          throw new ApiError(400, "No context found");
        }

        const docsContent = contextArray
          .map((doc) => {
            // Ensure doc has pageContent property
            if (doc && typeof doc.pageContent === "string") {
              return doc.pageContent;
            }
            console.warn("⚠️ Document missing pageContent:", doc);
            return "";
          })
          .filter((content) => content.trim().length > 0)
          .join("\n");

        console.log("📝 Generated context content length:", docsContent.length);

        const messages = await promptTemplate.invoke({
          question: state.question,
          context: docsContent,
        });
        const response = await llm.invoke(messages);
        return { answer: response.content };
      } catch (generateError) {
        console.error("❌ Generation failed:", generateError);
        throw new ApiError(400, "Failed to generate the answer!");
      }
    };

    const graph = new StateGraph(StateAnnotation)
      .addNode("retrieve", retrieve)
      .addNode("generate", generate)
      .addEdge("__start__", "retrieve")
      .addEdge("retrieve", "generate")
      .addEdge("generate", "__end__")
      .compile();

    let inputs = {
      question: trimmedQuestion,
    };

    const result = await graph.invoke(inputs);

    if (result.context && result.context.length > 0) {
      console.log(result.context.slice(0, 2));
    }
    console.log(result.context.slice(0, 2));

    const lastPdf = await db
      .select()
      .from(pdfLoad)
      .orderBy(desc(pdfLoad.id))
      .limit(1);
    await db.insert(pdfResponse).values({
      loadId: lastPdf[0].id,
      question: trimmedQuestion,
      answer: result["answer"],
    });
    console.log("Response inserted into PostgresQL Table!");

    console.log(
      `\nQuestion: ${result["question"]} \n\nAnswer: ${result["answer"]}`
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { answer: result["answer"] },
          "Pdf loaded successfully!"
        )
      );
  } catch (error) {
    console.error("Error generating PDF response:", error);
    return res
      .status(500)
      .json(new ApiResponse(500, "", "Failed to generate response!"));
  }
};

const fetchPdfs = async (req, res) => {
  try {
    const allPdf = await db.select().from(pdfLoad);
    if (allPdf.length === 0) {
      throw new ApiError(400, "No PDFs exist!");
    }

    return res
      .status(200)
      .json(new ApiResponse(200, allPdf, "Fetched pdf successfully!"));
  } catch (error) {
    console.error("Error fetching pdf", error);
    return res
      .status(500)
      .json(new ApiResponse(500, "", "Failed to fetch the Pdfs"));
  }
};

const fetchPdfById = async (req, res) => {
  try {
    console.log("req.params:", req.params);
    const { pdfId } = req.params;

    if (!pdfId || isNaN(Number(id))) {
      throw new ApiError(400, "Invalid or missing ID parameter");
    }

    const pdfById = await db
      .select()
      .from(pdfLoad)
      .where(eq(pdfLoad.id, Number(pdfId)));

    if (pdfById.length === 0) {
      return res.status(404).json(new ApiResponse(404, null, "PDF not found"));
    }

    return res
      .status(200)
      .json(new ApiResponse(200, pdfById[0], "Fetched PDF successfully!"));
  } catch (error) {
    console.error("Error fetching PDF", error);
    return res
      .status(error.statusCode || 500)
      .json(
        new ApiResponse(
          error.statusCode || 500,
          null,
          error.message || "Failed to fetch the PDF"
        )
      );
  }
};

const deletePdfBId = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid ID" });

  try {
    const result = await db
      .select({ collectionName: pdfLoad.collectionName })
      .from(pdfLoad)
      .where(eq(pdfLoad.id, id));

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "PDF not found in DB" });
    }

    const { collectionName } = result[0];

    if (!collectionName) {
      return res
        .status(400)
        .json({ error: "Collection name missing for the PDF" });
    }

    const collection = await client.getCollection({ name: collectionName });
    if (collection) {
      await client.deleteCollection({ name: collectionName });
    }

    await db.delete(pdfLoad).where(eq(pdfLoad.id, id));

    return res.status(200).json({ message: "✅ PDF deleted successfully!" });
  } catch (error) {
    console.error("❌ Delete error:", error);
    return res.status(500).json({ error: "Failed to delete PDF" });
  }
};

export { inputPdf, generatePdfResponse, fetchPdfs, fetchPdfById, deletePdfBId };
