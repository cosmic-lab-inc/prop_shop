import "./styles/globals.css";
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Chatbot, Covest, Demo, Error, Home, PageWrapper } from "./pages";
import { observer } from "mobx-react";

export const App = observer(() => {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route
            index
            element={
              <PageWrapper>
                <Home />
              </PageWrapper>
            }
            errorElement={<Error />}
          />
          <Route
            path="chat"
            element={
              <PageWrapper>
                <Chatbot />
              </PageWrapper>
            }
            errorElement={<Error />}
          />
          <Route
            path="demo"
            element={
              <PageWrapper>
                <Demo />
              </PageWrapper>
            }
            errorElement={<Error />}
          />
          <Route
            path="covest"
            element={
              <PageWrapper>
                <Covest />
              </PageWrapper>
            }
            errorElement={<Error />}
          />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
});
