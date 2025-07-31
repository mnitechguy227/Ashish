# Journal Explorer

This project provides a simple demo for browsing journal rankings from the ABS and ABDC lists. It contains a small Node server and a minimal React client loaded via CDN links.

## Running the Demo

1. Start the server:
   ```bash
   node server/server.js
   ```
   The API will run on `http://localhost:3001`.

2. Open `client/index.html` in a browser. The page will request data from the server and render a table of journals. Use the buttons to switch between ABS and ABDC lists and the search box to filter by title.

## Notes

The dataset is only a placeholder with a few example journals. For a real deployment you would replace `server/data/abs.json` and `server/data/abdc.json` with full datasets and likely use a framework such as Express and a database for storage.
