import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  FileText,
  MessageCircle,
  X,
  Send,
  User,
  Bot,
  Menu,
  Trash,
} from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const LOCAL_STORAGE_KEY = "uploaded_pdfs";

const PDFDashboard = () => {
  const [uploadedPDFs, setUploadedPDFs] = useState([]);
  const [currentView, setCurrentView] = useState("dashboard");
  const [selectedPDF, setSelectedPDF] = useState(null);
  const [chatMessages, setChatMessages] = useState({});
  const [userQuestion, setUserQuestion] = useState("");
  const [isUploadingPDF, setIsUploadingPDF] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    const savedPDFs = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedPDFs) {
      try {
        setUploadedPDFs(JSON.parse(savedPDFs));
      } catch (error) {
        console.error("Error parsing localStorage PDFs:", error);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
    handleFetchPdf();
  }, []);

  useEffect(() => {
    if (uploadedPDFs.length > 0) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(uploadedPDFs));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [uploadedPDFs]);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, selectedPDF]);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    const pdfFiles = files.filter((file) => file.type === "application/pdf");

    if (pdfFiles.length === 0) {
      toast.error("❌ Please select valid PDF files.");
      return;
    }

    setIsUploadingPDF(true);
    const uploadPromises = pdfFiles.map(async (file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`❌ ${file.name} exceeds 10MB limit`);
        return null;
      }

      const formData = new FormData();
      formData.append("newPdf", file);

      try {
        const response = await axios.post(
          `${import.meta.env.VITE_API_URI}/api/pdf/load-pdf`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          }
        );

        const pdfId = response.data?.message?.pdfId;
        if (!pdfId) throw new Error("No PDF ID returned");

        toast.success(`✅ ${file.name} uploaded successfully!`);
        return pdfId;
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        toast.error(`❌ Failed to upload ${file.name}`);
        return null;
      }
    });

    await Promise.all(uploadPromises);
    await handleFetchPdf();
    setIsUploadingPDF(false);
    event.target.value = "";
  };

  const handleFetchPdf = async () => {
    setIsUploadingPDF(true);
    try {
      const response = await axios.get(
        `${import.meta.env.VITE_API_URI}/api/pdf/fetch-pdf`
      );
      const pdfData = Array.isArray(response.data?.message)
        ? response.data.message
        : [];

      const uploadedPdfs = pdfData.map((pdf, index) => ({
        id: pdf.id || `pdf-${index}`,
        name: pdf.filename || "Untitled.pdf",
        size: formatFileSize(pdf.size) || "Unknown size",
        uploadDate: pdf.createdAt
          ? new Date(pdf.createdAt).toLocaleDateString()
          : "Unknown date",
      }));

      setUploadedPDFs(uploadedPdfs);
    } catch (error) {
      console.error("Error fetching PDFs:", error);
      toast.error("❌ Failed to fetch PDFs");
    }
    setIsUploadingPDF(false);
  };

  const formatFileSize = (bytes) => {
    if (bytes == null || isNaN(bytes)) return "Unknown size";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  const deletePDF = async (id) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URI}/api/pdf/delete-pdf/${id}`
      );
      setUploadedPDFs((prev) => prev.filter((pdf) => pdf.id !== id));
      if (selectedPDF && selectedPDF.id === id) {
        setCurrentView("dashboard");
        setSelectedPDF(null);
      }
      toast.success("✅ PDF deleted successfully!");
    } catch (error) {
      console.error("Error deleting PDF:", error);
      toast.error("❌ Failed to delete PDF");
    }
  };

  const openPDFChat = (pdf) => {
    setSelectedPDF(pdf);
    setCurrentView("chat");
    setIsSidebarOpen(false);

    if (!chatMessages[pdf.id]) {
      setChatMessages((prev) => ({
        ...prev,
        [pdf.id]: [
          {
            id: Date.now(),
            type: "bot",
            message: `Hello! I'm ready to help you with "${pdf.name}". You can ask me questions about the content, request summaries, or discuss specific sections.`,
            timestamp: new Date().toLocaleTimeString(),
          },
        ],
      }));
    }
  };

  const sendMessage = async () => {
    if (!userQuestion.trim() || !selectedPDF) return;

    const newMessage = {
      id: Date.now(),
      type: "user",
      message: userQuestion,
      timestamp: new Date().toLocaleTimeString(),
    };

    setChatMessages((prev) => ({
      ...prev,
      [selectedPDF.id]: [...(prev[selectedPDF.id] || []), newMessage],
    }));

    setIsSendingMessage(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URI}/api/pdf/pdf-response`,
        {
          userQuestion,
          pdfId: selectedPDF.id,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.message || "Server returned an error");
      }

      const botResponse = {
        id: Date.now() + 1,
        type: "bot",
        message:
          typeof response.data.message === "string"
            ? response.data.message
            : response.data.message?.answer ||
              "Sorry, I couldn't process that request.",
        timestamp: new Date().toLocaleTimeString(),
      };

      setChatMessages((prev) => ({
        ...prev,
        [selectedPDF.id]: [...(prev[selectedPDF.id] || []), botResponse],
      }));
    } catch (error) {
      console.error("Error fetching PDF response:", error);
      toast.error(
        `❌ ${error.message || "Failed to get response from the server"}`
      );
      const errorResponse = {
        id: Date.now() + 1,
        type: "bot",
        message:
          typeof error.message === "string"
            ? error.message
            : "Sorry, there was an error processing your request.",
        timestamp: new Date().toLocaleTimeString(),
      };
      setChatMessages((prev) => ({
        ...prev,
        [selectedPDF.id]: [...(prev[selectedPDF.id] || []), errorResponse],
      }));
    }

    setIsSendingMessage(false);
    setUserQuestion("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const Sidebar = () => (
    <div
      className={`fixed inset-y-0 left-0 z-50 w-80 bg-slate-900 text-white flex flex-col transform transition-transform duration-300 md:w-80 md:static md:transform-none ${
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      }`}
    >
      <div className="p-6 border-b border-slate-700 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6" />
          PDF Dashboard
        </h1>
        <button onClick={toggleSidebar} className="md:hidden">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="p-6 border-b border-slate-700">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploadingPDF}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-500 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
          <Upload className="w-5 h-5" />
          {isUploadingPDF ? "Uploading..." : "Upload PDF"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          disabled={isUploadingPDF}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">
            Uploaded PDFs ({uploadedPDFs.length})
          </h2>

          {isUploadingPDF ? (
            <div className="text-slate-500 text-center py-8">
              <p>Loading PDFs...</p>
            </div>
          ) : uploadedPDFs.length === 0 ? (
            <div className="text-slate-500 text-center py-8">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No PDFs uploaded yet</p>
              <p className="text-sm">Upload a PDF to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {uploadedPDFs.map((pdf) => (
                <div
                  key={pdf.id}
                  className={`group relative bg-slate-800 hover:bg-slate-700 rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedPDF?.id === pdf.id
                      ? "ring-2 ring-blue-500 bg-slate-700"
                      : ""
                  }`}
                  onClick={() => openPDFChat(pdf)}
                >
                  <div className="flex items-start gap-3">
                    <FileText className="w-8 h-8 text-red-500 flex-shrink-0 mt-1" />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white truncate mb-1">
                        {pdf.name}
                      </h3>
                      <div className="text-xs text-slate-400 space-y-1">
                        <p>{pdf.size}</p>
                        <p>Uploaded {pdf.uploadDate}</p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePDF(pdf.id);
                      }}
                      className=" text-slate-200 hover:text-red-400 transition-colors"
                    >
                      <Trash className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-blue-400">
                    <MessageCircle className="w-3 h-3" />
                    Click to chat
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const ChatScreen = React.useMemo(() => {
    if (!selectedPDF) return null;

    return (
      <div className="flex-1 flex flex-col bg-white w-screen h-screen">
        <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => {
                setCurrentView("dashboard");
                setSelectedPDF(null);
              }}
              className="text-slate-600 hover:text-slate-900"
            >
              ← Back
            </button>
            <FileText className="w-6 h-6 text-red-500" />
            <div>
              <h2 className="font-semibold truncate max-w-[150px] text-slate-900">
                {selectedPDF.name}
              </h2>
              <p className="text-sm text-slate-500">PDF Chat Assistant</p>
            </div>
          </div>
          <button onClick={toggleSidebar} className="md:hidden">
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4"
        >
          {(chatMessages[selectedPDF.id] || []).map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.type === "user" ? "justify-end" : ""
              }`}
            >
              {message.type === "bot" && (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
              )}

              <div
                className={`max-w-[80%] sm:max-w-2xl ${
                  message.type === "user" ? "order-first" : ""
                }`}
              >
                <div
                  className={`rounded-lg p-3 sm:p-4 ${
                    message.type === "user"
                      ? "bg-blue-600 text-white ml-auto"
                      : "bg-slate-100 text-slate-900"
                  }`}
                >
                  <p>{message.message}</p>
                </div>
                <p className="text-xs text-slate-500 mt-1 px-2">
                  {message.timestamp}
                </p>
              </div>

              {message.type === "user" && (
                <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="flex gap-3">
            <textarea
              value={userQuestion}
              onChange={(e) => setUserQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about this PDF..."
              className="flex-1 border border-slate-300 rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              rows={2}
              disabled={isSendingMessage}
            />
            <button
              onClick={sendMessage}
              disabled={!userQuestion.trim() || isSendingMessage}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-4 sm:px-6 py-3 rounded-lg flex items-center justify-center transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }, [selectedPDF, chatMessages, userQuestion, isSendingMessage]);

  const DashboardView = () => (
    <div className="flex-1 flex items-center justify-center bg-slate-50 w-screen p-4 sm:p-6">
      <div className="text-center max-w-md">
        <FileText className="w-16 sm:w-24 h-16 sm:h-24 text-slate-400 mx-auto mb-6" />
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2">
          Welcome to PDF Dashboard
        </h2>
        <p className="text-slate-600 mb-8 text-sm sm:text-base">
          Upload PDF files using the sidebar and click on any PDF to start a
          conversation about its content.
        </p>
        {uploadedPDFs.length > 0 && (
          <p className="text-sm text-slate-500">
            You have {uploadedPDFs.length} PDF
            {uploadedPDFs.length !== 1 ? "s" : ""} uploaded. Click on any PDF in
            the sidebar to start chatting.
          </p>
        )}
        <button
          onClick={toggleSidebar}
          className="md:hidden mt-4 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg"
        >
          Open Sidebar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        {currentView === "chat" && selectedPDF ? ChatScreen : <DashboardView />}
      </div>
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={toggleSidebar}
        />
      )}
    </div>
  );
};

export default PDFDashboard;
