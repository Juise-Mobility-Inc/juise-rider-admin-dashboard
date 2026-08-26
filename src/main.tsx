import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "./index.css";
import "leaflet/dist/leaflet.css";
import App from "./App.tsx";
import { store } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";

export const Router = import.meta.env.PROD ? HashRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <Router>
          <App />
        </Router>
      </Provider>
    </ErrorBoundary>
  </StrictMode>,
);
