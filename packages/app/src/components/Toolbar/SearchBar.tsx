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
import { randomName, Searchable } from "@cosmic-lab/prop-shop-sdk";

function useOutsideClick(callback: () => void) {
  const [ref, setRef] = React.useState<React.MutableRefObject<any>>(
    React.useRef(null),
  );

  React.useEffect(() => {
    /**
     * Alert if clicked on outside of element
     */
    function handleClickOutside(event: any) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    }

    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref]);

  return ref;
}

export const SearchBar = ({
  search,
  changeSearch,
  placeholder,
  show,
  setShow,
  options,
}: {
  search: string;
  changeSearch: (input: string) => void;
  placeholder: string;
  show: boolean;
  setShow: (show: boolean) => void;
  options: Searchable<unknown>[];
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
          {results.map((name) => {
            return (
              <ListItem
                key={name.title}
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
                >
                  <ListItemText
                    primary={randomName(2)}
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
