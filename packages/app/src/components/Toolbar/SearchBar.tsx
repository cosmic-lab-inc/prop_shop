import React from "react";
import { Box, ListItem, ListItemButton, ListItemText } from "@mui/material";
import { customTheme } from "../../styles";
import SearchIcon from "@mui/icons-material/Search";
import {
  SearchBarWrapper,
  SearchIconWrapper,
  SearchInput,
  SearchList,
} from "./styles";
import { Searchable } from "@cosmic-lab/prop-shop-sdk";
import { useOutsideClick } from "../../lib";

export const SearchBar = ({
  search,
  changeSearch,
  placeholder,
  options,
  show,
  setShow,
  onClick,
}: {
  search: string;
  changeSearch: (input: string) => void;
  placeholder: string;
  options: Searchable<unknown>[];
  show: boolean;
  setShow: (show: boolean) => void;
  onClick: (value: Searchable<unknown>) => void;
}) => {
  let results = options.filter((option) => {
    if (search === "") {
      return option.title;
    } else {
      return option.title.toLowerCase().includes(search);
    }
  });
  if (results.length === 0) {
    results = options;
  }

  const ref = useOutsideClick(() => {
    changeSearch("");
    setShow(false);
  });

  return (
    <Box
      ref={ref}
      sx={{
        width: "25%",
      }}
    >
      <SearchBarWrapper>
        <SearchIconWrapper>
          <SearchIcon color="inherit" />
        </SearchIconWrapper>
        <SearchInput
          placeholder={placeholder}
          value={search}
          onChange={(e: any) => changeSearch(e.target.value)}
          onClick={() => setShow(!show)}
        />
      </SearchBarWrapper>
      {show && (
        <SearchList>
          {results.map((value) => {
            return (
              <ListItem
                key={value.title}
                sx={{
                  p: 0,
                  m: 0,
                }}
              >
                <ListItemButton
                  sx={{
                    p: 0,
                    m: 0,
                    "&:hover": {
                      bgcolor: customTheme.grey2,
                    },
                  }}
                  onClick={() => {
                    onClick(value);
                  }}
                >
                  <ListItemText
                    primary={value.title}
                    disableTypography
                    sx={{
                      p: "10px",
                      m: 0,
                      fontFamily: customTheme.font.light,
                      fontWeight: 300,
                      fontSize: 16,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </SearchList>
      )}
    </Box>
  );
};
