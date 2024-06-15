import React, { useState } from "react";
import "./Chatbot.css";
import { getQuery } from "../../api";
import { Box, Container, Typography } from "@mui/material";
import { customTheme } from "../../styles";

import Paper from "@mui/material/Paper";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import ReactMarkdown from "react-markdown";
import { Typing } from "../../components";

type ChatMessage = {
  text?: string | null;
  sender: "user" | "bot";
};

export function Chatbot() {
  const welcomeMessage: ChatMessage = {
    text: `Hey 👋 I'm Epoch, a Solana historian and data analyst. Ask me anything about Solana and I'll do my best to help you out.`,
    sender: "bot",
  };

  // TODO: local/session storage for recent history? Otherwise this resets on page reload.
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async (event: any) => {
    event.preventDefault();
    if (input.trim()) {
      console.log("input", input.trim());
      let message = input;
      setMessages([...messages, { text: message, sender: "user" }]);
      setInput("");

      setLoading(true);
      const botResponse = await getQuery(message);
      setLoading(false);

      setMessages((prevMessages: ChatMessage[]) => [
        ...prevMessages,
        { text: botResponse, sender: "bot" },
      ]);
    }
  };

  return (
    <Box
      sx={{
        minWidth: "90%",
        maxWidth: "90%",
        minHeight: "900px",
        bgcolor: customTheme.dark,
        borderRadius: "2px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexDirection: "column",
        padding: "30px",
      }}
    >
      <Box
        sx={{
          width: "80%",
          minHeight: "700px",
          maxHeight: "700px",
          bgcolor: customTheme.grey,
          borderRadius: "2px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          clipPath: "polygon(10% 0, 100% 0, 100% 90%, 90% 100%, 0 100%, 0 10%)",
        }}
      >
        <Container
          sx={{
            width: "70%",
            flexGrow: 1,
            padding: "20px",
            overflowY: "auto",
            scrollbarWidth: "none" /* For Firefox */,
            msOverflowStyle: "none" /* For Internet Explorer and Edge */,
            "&::-webkit-scrollbar": {
              display: "none" /* For Chrome, Safari, and Opera */,
            },
            display: "flex",
            flexDirection: "column",
            gap: "30px",
          }}
        >
          {messages.map((message, index) => {
            return (
              <Box
                sx={{
                  padding: "10px",
                  borderRadius: "2px",
                  maxWidth: "100%",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  bgcolor:
                    message.sender === "user"
                      ? customTheme.dark
                      : customTheme.light,
                  color:
                    message.sender === "user"
                      ? customTheme.light
                      : customTheme.dark,
                }}
                key={index}
              >
                <ReactMarkdown
                  children={message.text}
                  components={{
                    // Use MUI Typography for text elements for consistent styling
                    p: ({ node, ...props }) => {
                      return (
                        <Typography
                          variant="body1"
                          sx={{
                            paddingLeft: "10px",
                            paddingRight: "10px",
                          }}
                          children={props.children}
                        />
                      );
                    },
                    // Add more mappings from markdown elements to MUI components if needed
                  }}
                />
              </Box>
            );
          })}
          {loading && <Typing />}
        </Container>
      </Box>
      <Paper
        component="form"
        sx={{
          p: "6px 6px",
          display: "flex",
          width: "70%",
          bgcolor: "transparent",
          border: `1px solid ${customTheme.light}`,
          marginTop: "20px",
          marginBottom: "20px",
          flexDirection: "row",
        }}
      >
        <IconButton
          sx={{
            p: "10px",
            color: customTheme.light,
            alignItems: "flex-end",
          }}
          aria-label="menu"
        >
          <MenuIcon />
        </IconButton>
        <InputBase
          sx={{
            ml: 1,
            mr: 1,
            flex: 1,
            color: customTheme.light,
          }}
          placeholder="Ask me anything..."
          onChange={(e) => setInput(e.target.value)}
          inputProps={{ "aria-label": "query-ai" }}
          multiline
          maxRows={5}
        />
        <IconButton
          color="primary"
          sx={{
            p: 0,
            borderRadius: "5px",
            alignItems: "flex-end",
          }}
          type="submit"
          onClick={sendMessage}
          aria-label="directions"
        >
          <Box
            sx={{
              bgcolor: customTheme.rust,
              borderRadius: "5px",
              padding: "5px",
              display: "flex",
              justifyContent: "center",
              p: "10px",
              "&:hover": {
                bgcolor: customTheme.red,
              },
            }}
          >
            <SendRoundedIcon
              sx={{
                color: customTheme.light,
              }}
            />
          </Box>
        </IconButton>
      </Paper>
    </Box>
  );
}
