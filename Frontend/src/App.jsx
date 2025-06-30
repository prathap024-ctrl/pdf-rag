import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import PDFDashboard from "./pages/DashBoard";

const App = () => {
  return (
    <div>
      <Router>
        <Routes>
          <Route path="/" element={<PDFDashboard />} />
        </Routes>
      </Router>
    </div>
  );
};

export default App;
