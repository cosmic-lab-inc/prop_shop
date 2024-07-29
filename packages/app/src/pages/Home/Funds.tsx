import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, ButtonProps, styled, Typography } from "@mui/material";
import { FundOverviewCard } from "./FundOverviewCard";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import { mockFundOverviews } from "../../lib";
import useEmblaCarousel from "embla-carousel-react";
import { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { customTheme } from "../../styles";

// todo: fetch vaults and sort by criteria using PropShopClient
export function Funds({ client }: { client: PropShopClient }) {
  const [funds, setFunds] = React.useState<FundOverview[]>([]);

  React.useEffect(() => {
    async function fetchFunds() {
      if (
        process.env.ENV === "dev" ||
        process.env.RPC_URL === "http://localhost:8899"
      ) {
        const _funds = (await client.fundOverviews()).map((fund) => {
          return {
            ...fund,
            data: mockFundOverviews()[0].data,
          };
        });
        setFunds(_funds);
      } else {
        setFunds(await client.fundOverviews());
      }
    }

    fetchFunds();
  }, []);

  const options: EmblaOptionsType = {
    containScroll: false,
    // watchSlides: false,
    // watchResize: false,
    // slidesToScroll: "auto",
    // dragFree: true,
    // skipSnaps: true,
    align: "start",
  };
  const [emblaRef, emblaApi] = useEmblaCarousel(options);

  const {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick,
  } = usePrevNextButtons(emblaApi);

  return (
    <Box
      sx={{
        width: "70%",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        pb: 5,
      }}
    >
      <Box
        sx={{
          width: "60%",
          height: "100%",
          display: "flex",
          p: 5,
          borderRadius: "10px",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          gap: 2,
        }}
      >
        <Typography variant="h1">Build wealth while you sleep</Typography>
        <Typography variant="h3">
          Invest in the best traders on Solana
        </Typography>
      </Box>
      <Box
        ref={emblaRef}
        sx={{
          width: "100%",
          height: "100%",
          display: "flex",
          borderRadius: "10px",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        <InnerContainer>
          {funds.map((fund, i) => {
            return (
              <FundOverviewCard key={i} client={client} fundOverview={fund} />
            );
          })}
        </InnerContainer>
      </Box>

      <ButtonControls>
        <PrevButton onClick={onPrevButtonClick} disabled={prevBtnDisabled} />
        <NextButton onClick={onNextButtonClick} disabled={nextBtnDisabled} />
      </ButtonControls>
    </Box>
  );
}

const InnerContainer = styled("div")(({ theme }) => ({
  backfaceVisibility: "hidden",
  display: "flex",
  touchAction: "pan-y",
  gap: "20px",
}));

type UsePrevNextButtonsType = {
  prevBtnDisabled: boolean;
  nextBtnDisabled: boolean;
  onPrevButtonClick: () => void;
  onNextButtonClick: () => void;
};

const usePrevNextButtons = (
  emblaApi: EmblaCarouselType | undefined,
): UsePrevNextButtonsType => {
  const [prevBtnDisabled, setPrevBtnDisabled] = useState(true);
  const [nextBtnDisabled, setNextBtnDisabled] = useState(true);

  const onPrevButtonClick = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollPrev();
  }, [emblaApi]);

  const onNextButtonClick = useCallback(() => {
    if (!emblaApi) return;
    emblaApi.scrollNext();
  }, [emblaApi]);

  const onSelect = useCallback((emblaApi: EmblaCarouselType) => {
    setPrevBtnDisabled(!emblaApi.canScrollPrev());
    setNextBtnDisabled(!emblaApi.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    onSelect(emblaApi);
    emblaApi.on("reInit", onSelect).on("select", onSelect);
  }, [emblaApi, onSelect]);

  return {
    prevBtnDisabled,
    nextBtnDisabled,
    onPrevButtonClick,
    onNextButtonClick,
  };
};

const ButtonControls = styled("div")(({ theme }) => ({
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  justifyContent: "space-between",
  gap: "1.2rem",
  marginTop: "1.8rem",
}));

function PrevButton(props: ButtonProps) {
  const { children, ...restProps } = props;

  return (
    <Button
      sx={{
        zIndex: 1,
        appearance: "none",
        bgcolor: "transparent",
        touchAction: "manipulation",
        display: "inline-flex",
        textDecoration: "none",
        cursor: "pointer",
        border: restProps.disabled
          ? `transparent`
          : `2px solid ${customTheme.grey}`,
        padding: 0,
        margin: 0,
        width: "3.6rem",
        height: "3.6rem",
        borderRadius: "50%",
        alignItems: "center",
        justifyContent: "center",
      }}
      {...restProps}
    >
      <svg
        style={{
          width: "35%",
          height: "35%",
          color: restProps.disabled ? `transparent` : customTheme.light,
        }}
        viewBox="0 0 532 532"
      >
        <path
          fill="currentColor"
          d="M355.66 11.354c13.793-13.805 36.208-13.805 50.001 0 13.785 13.804 13.785 36.238 0 50.034L201.22 266l204.442 204.61c13.785 13.805 13.785 36.239 0 50.044-13.793 13.796-36.208 13.796-50.002 0a5994246.277 5994246.277 0 0 0-229.332-229.454 35.065 35.065 0 0 1-10.326-25.126c0-9.2 3.393-18.26 10.326-25.2C172.192 194.973 332.731 34.31 355.66 11.354Z"
        />
      </svg>
      {children}
    </Button>
  );
}

function NextButton(props: ButtonProps) {
  const { children, ...restProps } = props;

  return (
    <Button
      sx={{
        zIndex: 1,
        appearance: "none",
        bgcolor: "transparent",
        touchAction: "manipulation",
        display: "inline-flex",
        textDecoration: "none",
        cursor: "pointer",
        border: restProps.disabled
          ? `transparent`
          : `2px solid ${customTheme.grey}`,
        padding: 0,
        margin: 0,
        width: "3.6rem",
        height: "3.6rem",
        borderRadius: "50%",
        alignItems: "center",
        justifyContent: "center",
      }}
      {...restProps}
    >
      <svg
        style={{
          width: "35%",
          height: "35%",
          color: restProps.disabled ? `transparent` : customTheme.light,
        }}
        viewBox="0 0 532 532"
      >
        <path
          fill="currentColor"
          d="M176.34 520.646c-13.793 13.805-36.208 13.805-50.001 0-13.785-13.804-13.785-36.238 0-50.034L330.78 266 126.34 61.391c-13.785-13.805-13.785-36.239 0-50.044 13.793-13.796 36.208-13.796 50.002 0 22.928 22.947 206.395 206.507 229.332 229.454a35.065 35.065 0 0 1 10.326 25.126c0 9.2-3.393 18.26-10.326 25.2-45.865 45.901-206.404 206.564-229.332 229.52Z"
        />
      </svg>
      {children}
    </Button>
  );
}
