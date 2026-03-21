"use client";

interface UnlockViewerProps {
  content: string;
  title: string;
  onClose: () => void;
}

export function UnlockViewer({ content, title, onClose }: UnlockViewerProps) {
  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
            {content}
          </pre>
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-800">
          <button
            onClick={handleDownload}
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm"
          >
            Download
          </button>
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
