import { html, css, unsafeCSS } from "lit";
import {
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
} from "chart.js";
import "chartjs-adapter-date-fns";
import { cs } from "date-fns/locale/cs";
import { formatDate, formatMoney } from "./format.mjs";

/** @typedef {import("chart.js").ChartData} ChartData */

Chart.register(
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip
);

Chart.defaults.font.size = 12;
Chart.defaults.font.family = "'IBM Plex Sans Var', system-ui, sans-serif";

const CANVAS_ID = "hlidac-shopu-chart";
const red = "#ff8787";
const blue = "#5c62cd";

/**
 * @return {ChartData}
 */
function createChartData(
  currentPrice,
  originalPrice,
  originalPriceLabel,
  currentPriceLabel
) {
  return {
    labels: currentPrice.map(p => p.x),
    datasets: [
      {
        data: Object.fromEntries(
          originalPrice?.map(({ x, y }) => [x, y]) ?? []
        ),
        label: originalPriceLabel,
        stepped: "after",
        backgroundColor: "#ffffff00",
        borderColor: blue,
        borderWidth: 2,
        borderCapStyle: "round",
        fill: false,
        pointRadius: 0,
        spanGaps: false
      },
      {
        data: Object.fromEntries(currentPrice?.map(({ x, y }) => [x, y]) ?? []),
        label: "Doplněná prodejní cena",
        stepped: "after",
        backgroundColor: "#ffffff00",
        borderColor: red,
        borderWidth: 1,
        borderDash: [5, 10],
        borderCapStyle: "round",
        fill: false,
        pointRadius: 0,
        spanGaps: true
      },
      {
        data: Object.fromEntries(currentPrice?.map(({ x, y }) => [x, y]) ?? []),
        label: currentPriceLabel,
        stepped: "after",
        backgroundColor: "#ffffff00",
        borderColor: red,
        borderWidth: 2,
        borderCapStyle: "round",
        fill: false,
        pointRadius: 0,
        spanGaps: false
      }
    ]
  };
}

const tooltipStyles = {
  titleColor: "#1d3650",
  bodyColor: "#1d3650",
  bodySpacing: 4,
  backgroundColor: "#fcf4a7",
  borderColor: "#fbea61",
  borderWidth: 2,
  xPadding: 12,
  yPadding: 8,
  caretSize: 12
};

function tooltipFormatter(originalPriceLabel, currentPriceLabel) {
  return {
    title(items) {
      const item = items[0];
      const date = new Date((item.raw ?? item.parsed).x);
      return formatDate(date);
    },
    label(item) {
      const val = item.raw ?? item.parsed;
      if (item.datasetIndex === 0) {
        return `${originalPriceLabel}: ${formatMoney(val.y)}`;
      } else if (item.datasetIndex === 1) {
        return `${currentPriceLabel}: ${formatMoney(val.y)}`;
      }
      return null;
    },
    labelColor(item) {
      const color = item.datasetIndex > 0 ? red : blue;
      return { backgroundColor: color };
    }
  };
}

function configureScales(currentPrice, originalPrice) {
  const values = new Set(
    currentPrice
      .concat(originalPrice)
      .map(p => p.y)
      .filter(x => x != null)
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const count = currentPrice.length;
  const stepSize = Math.floor(count / 12) || 1;
  return {
    x: {
      type: "time",
      time: {
        unit: "day",
        displayFormats: { day: "d. MMM ’yy" }
      },
      ticks: { stepSize },
      adapters: { date: { locale: cs } }
    },
    y: {
      type: "linear",
      suggestedMax: max + 0.1 * max,
      suggestedMin: min - 0.1 * min,
      ticks: { callback: formatMoney }
    }
  };
}

export function createChart(
  ctx,
  currentPrice,
  originalPrice,
  originalPriceLabel,
  currentPriceLabel,
  maintainAspectRatio = true
) {
  return new Chart(ctx, {
    type: "line",
    locale: "cs",
    data: createChartData(
      currentPrice,
      originalPrice,
      originalPriceLabel,
      currentPriceLabel
    ),
    options: {
      maintainAspectRatio,
      scales: configureScales(currentPrice, originalPrice),
      hover: {
        mode: "nearest",
        intersect: true
      },
      plugins: {
        tooltip: {
          mode: "index",
          intersect: false,
          position: "nearest",
          callbacks: tooltipFormatter(originalPriceLabel, currentPriceLabel),
          ...tooltipStyles
        }
      }
    }
  });
}

export function defineStyles() {
  return css`
    .hs-legend {
      display: flex;
      justify-content: flex-end;
      font-size: 12px;
    }
    .hs-legend__point {
      width: 12px;
      height: 12px;
      border-radius: 2px;
      margin-right: 5px;
      margin-top: 2px;
    }
    .hs-legend__point--original-price {
      background-color: ${unsafeCSS(blue)};
    }
    .hs-legend__point--current-price {
      background-color: ${unsafeCSS(red)};
      margin-left: 8px;
    }
  `;
}

export function chartTemplate(
  originalPriceLabel,
  currentPriceLabel,
  showLegend = true
) {
  return html`
    <div class="hs-chart-wrapper">
      ${showLegend
        ? html`
            <div class="hs-legend">
              <div
                class="hs-legend__point hs-legend__point--original-price"
              ></div>
              <span>${originalPriceLabel}</span>
              <div
                class="hs-legend__point hs-legend__point--current-price"
              ></div>
              <span>${currentPriceLabel}</span>
            </div>
          `
        : null}
      <canvas id="${CANVAS_ID}" width="100%"></canvas>
    </div>
  `;
}

export function getCanvasContext(element) {
  const canvas = element.querySelector(`#${CANVAS_ID}`);
  return canvas.getContext("2d");
}
