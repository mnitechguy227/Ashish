# JournalRank Explorer

A lightweight demo application to browse mock ABS and ABDC journal rankings. The frontend is a React + Tailwind CSS single page loaded directly in the browser and the Node server only serves the JSON datasets.

## Running the Demo

1. Start the API server:
   ```bash
   node server/server.js
   ```
   The server listens on `http://localhost:3001` and exposes `/api/abs` and `/api/abdc`.

2. Open `client/index.html` in your browser. You can simply double click the file or serve it with any static server. The page will fetch the mock journal lists and render the JournalRank Explorer interface.

The interface lets you switch between ABS and ABDC tabs, filter journals by discipline, rank, publisher, country and keyword search, sort results and open stub modals for journal details and suggesting new titles.

The datasets in `server/data` are intentionally tiny placeholders. Replace them with full CSV exports for a real deployment.
