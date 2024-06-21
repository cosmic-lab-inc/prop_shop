import "./styles/globals.css";
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Error, Home, PageWrapper } from "./pages";
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
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
});
