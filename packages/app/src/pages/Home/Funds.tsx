import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, ButtonProps, styled, Typography } from "@mui/material";
import { FundOverview, PropShopClient } from "@cosmic-lab/prop-shop-sdk";
import useEmblaCarousel from "embla-carousel-react";
import { EmblaCarouselType, EmblaOptionsType } from "embla-carousel";
import { customTheme } from "../../styles";
import { observer } from "mobx-react";
import { mockFundOverviews } from "../../lib";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import "./embla.css";
import { FundOverviewCard } from "./FundOverviewCard";

type EmblaViewportRefType = <ViewportElement extends HTMLElement>(
  instance: ViewportElement | null,
) => void;

export const Funds = observer(({ client }: { client: PropShopClient }) => {
  const [funds, setFunds] = React.useState<FundOverview[]>([]);

  React.useEffect(() => {
    let _funds = client.fundOverviews;
    if (
      process.env.ENV === "dev" ||
      process.env.RPC_URL === "http://localhost:8899"
    ) {
      _funds = _funds.map((fund) => {
        return {
          ...fund,
          data: mockFundOverviews()[0].data,
        };
      });
    } else {
      _funds = _funds.filter((fund) => fund.tvl > 1_000);
    }
    setFunds(_funds);
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

  const SLIDE_COUNT = 6;
  const slides = Array.from(Array(SLIDE_COUNT).keys());

  return (
    <Box
      sx={{
        width: "80%",
        display: "flex",
        alignItems: "center",
        flexDirection: "column",
        pt: 5,
        pb: 8,
      }}
    >
      <Header />

      <Carousel emblaRef={emblaRef} client={client} funds={funds} />

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
        width: "90%",
        height: "100%",
        display: "flex",
        pt: 10,
        pb: 15,
        borderRadius: "10px",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        gap: 8,
      }}
    >
      <Typography variant="h1">Build wealth while you sleep</Typography>
      <Typography variant="h2">Invest in the best traders on Solana</Typography>
    </Box>
  );
}

function Carousel({
  emblaRef,
  client,
  funds,
}: {
  emblaRef: EmblaViewportRefType;
  client: PropShopClient;
  funds: FundOverview[];
}) {
  return (
    <section className="embla">
      <div className="embla__viewport" ref={emblaRef}>
        <div className="embla__container">
          {funds.map((fund, i) => (
            <div className="embla__slide" key={i}>
              <div className="embla__slide__number">
                <FundOverviewCard key={i} client={client} fundOverview={fund} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
        htmlColor={restProps.disabled ? customTheme.grey : customTheme.dark}
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
        htmlColor={restProps.disabled ? customTheme.grey : customTheme.dark}
        fontSize={"large"}
      />
      {children}
    </Button>
  );
}
