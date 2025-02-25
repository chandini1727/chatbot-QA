import React, { useState, useEffect } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

const App = () => {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [theme, setTheme] = useState("light");
  const [loading, setLoading] = useState(false);

  const MAX_FILES = 5; // Maximum file upload limit

  useEffect(() => {
    document.body.className = theme;
    fetchFiles();
  }, [theme]);

  const fetchFiles = async () => {
    try {
      const res = await axios.get("http://localhost:5000/debug");
      setFiles(res.data.stored_files || []);
    } catch (error) {
      console.error("Error fetching files", error);
      toast.error("Error occurred while fetching files.");
    }
  };

  const handleUpload = async (event) => {
    const selectedFiles = Array.from(event.target.files);

    if (files.length + selectedFiles.length > MAX_FILES) {
      toast.warn(`🚨 Maximum upload limit exceeded! Only ${MAX_FILES} files allowed.`);
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("file", file));

    try {
      const res = await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data.error) {
        // Backend detected an issue (e.g., unsupported file type)
        toast.error(`❌ ${res.data.error}`);
      } else {
        toast.success("✅ Upload Complete.");
        fetchFiles();
      }
    } catch (error) {
      console.error("Upload failed", error);
      toast.error("❌ Upload failed! Please try again.");
      event.target.value = ""; // Reset input field
    }
};


  const handleAsk = async () => {
    if (!selectedFile) {
      toast.warn("⚠️ Please select a file before asking a question.");
      return;
    }
    if (!question.trim()) {
      toast.warn("⚠️ Please enter a question before asking.");
      return;
    }

    setLoading(true);
    setChat((prevChat) => [...prevChat, { role: "user", text: question }]);

    try {
      const res = await axios.post("http://localhost:5000/ask", {
        filename: selectedFile,
        question,
      });
      setChat((prevChat) => [...prevChat, { role: "bot", text: res.data.answer }]);
    } catch (error) {
      console.error("Error fetching response", error);
      toast.error("❌ Error occurred while retrieving the answer.");
    }
    setLoading(false);
    setQuestion("");
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) return;

    try {
      await axios.delete("http://localhost:5000/delete", { data: { filename } });
      toast.success(`✅ ${filename} deleted successfully`);
      fetchFiles();
      if (selectedFile === filename) {
        setSelectedFile(null);
        setChat([]);
      }
    } catch (error) {
      console.error("Error deleting file", error);
      toast.error("❌ Error occurred while deleting the file.");
    }
  };

  return (
    <div className={`app-container ${theme}`}>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />
      <aside className="sidebar">
        <h2>Uploaded PDFs</h2>
        <input type="file" multiple onChange={handleUpload} />
        <ul className="file-list">
          {files.length > 0 ? (
            files.map((file, index) => (
              <li
                key={index}
                onClick={() => {
                  setSelectedFile(file);
                  setChat([]);
                }}
                className={`file-item ${selectedFile === file ? "active" : ""}`}
              >
                {file}
                <button className="delete-btn" onClick={() => handleDelete(file)}>
                  Delete
                </button>
              </li>
            ))
          ) : (
            <p>No files uploaded</p>
          )}
        </ul>
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          Toggle {theme === "light" ? "Dark" : "Light"} Mode
        </button>
      </aside>

      <main className="chat-section">
        <div className="selected-file">
          {selectedFile ? <h3>Chat with: {selectedFile}</h3> : <h3>Select a file to start chatting</h3>}
        </div>
        <div className="chat-box">
          {chat.map((msg, index) => (
            <div key={index} className={`chat-message ${msg.role}`}>
              {msg.text}
            </div>
          ))}
          {loading && <div className="thinking">🤖 Thinking...</div>}
        </div>
        <div className="chat-input">
          <input
            type="text"
            placeholder="Ask a question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={!selectedFile}
          />
          <button onClick={handleAsk} disabled={!selectedFile || !question.trim()}>
            Ask
          </button>
        </div>
      </main>
    </div>
  );
};

export default App;
