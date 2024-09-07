import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, ButtonProps, styled, Typography } from "@mui/material";
import { FundOverviewCard } from "./FundOverviewCard";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import useEmblaCarousel from "embla-carousel-react";
import { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { customTheme } from "../../styles";
import { observer } from "mobx-react";
import { mockFundOverviews } from "../../lib";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

type EmblaViewportRefType = <ViewportElement extends HTMLElement>(
  instance: ViewportElement | null,
) => void;

export const Funds = observer(({ client }: { client: PropShopClient }) => {
  const [funds, setFunds] = React.useState<FundOverview[]>([]);

  React.useEffect(() => {
    if (
      process.env.ENV === "dev" ||
      process.env.RPC_URL === "http://localhost:8899"
    ) {
      const _funds: FundOverview[] = client.fundOverviews.map((fund) => {
        return {
          ...fund,
          data: mockFundOverviews()[0].data,
        };
      });
      setFunds(_funds);
    } else {
      setFunds(client.fundOverviews);
    }
  }, [client.fundOverviews]);

  const options: EmblaOptionsType = {
    // containScroll: false,
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
      <Header />

      <CarouselContainer emblaRef={emblaRef}>
        {funds.map((fund, i) => {
          return (
            <FundOverviewCard key={i} client={client} fundOverview={fund} />
          );
        })}
      </CarouselContainer>

      <ButtonControls>
        <PrevButton onClick={onPrevButtonClick} disabled={prevBtnDisabled} />
        <NextButton onClick={onNextButtonClick} disabled={nextBtnDisabled} />
      </ButtonControls>
    </Box>
  );
});

function Header() {
  return (
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
      <Typography variant="h3">Invest in the best traders on Solana</Typography>
    </Box>
  );
}

function CarouselContainer({
  emblaRef,
  children,
}: {
  emblaRef: EmblaViewportRefType;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={emblaRef}
      style={{
        overflow: "hidden",
      }}
    >
      <div
        style={{
          backfaceVisibility: "hidden",
          display: "flex",
          touchAction: "pan-y pinch-zoom",
          gap: "20px",
          marginLeft: `calc(var(calc(100% / 3)) * -1)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

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
        textDecoration: "none",
        cursor: "pointer",
        border: `2px solid ${customTheme.grey}`,
        width: "3.6rem",
        height: "3.6rem",
        borderRadius: "10px",
        alignItems: "center",
        justifyContent: "center",
      }}
      {...restProps}
    >
      <ChevronLeftIcon
        htmlColor={restProps.disabled ? customTheme.grey : customTheme.light}
        fontSize={"large"}
      />
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
        textDecoration: "none",
        cursor: "pointer",
        border: `2px solid ${customTheme.grey}`,
        width: "3.6rem",
        height: "3.6rem",
        borderRadius: "10px",
        alignItems: "center",
        justifyContent: "center",
      }}
      {...restProps}
    >
      <ChevronRightIcon
        htmlColor={restProps.disabled ? customTheme.grey : customTheme.light}
        fontSize={"large"}
      />
      {children}
    </Button>
  );
}
