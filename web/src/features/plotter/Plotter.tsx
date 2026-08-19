"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { parseSampleLine, type Sample } from "./parse-samples";

export interface PlotterHandle {
  pushLine: (line: string) => void;
  clear: () => void;
}

// frontend.plan.md §7.2 — kanal başına sabit boyutlu ring buffer, son 2000 örnek
const MAX_SAMPLES = 2000;

// §11.1'in tek-aksiyon-rengi ilkesi tek seriye yeterli, ama grafik doğası
// gereği çoklu kanalı ayırt etmek için birkaç ek renk gerekiyor.
const PALETTE = ["#3d3bff", "#2e8b7a", "#c9a227", "#8b5cf6", "#e0607e", "#3f7fbf"];

function buildOptions(width: number, height: number, channels: string[]): uPlot.Options {
  return {
    width,
    height,
    scales: { x: { time: false } },
    axes: [
      { stroke: "#6b7a85", grid: { stroke: "#c3cdd420" }, label: "saniye" },
      { stroke: "#6b7a85", grid: { stroke: "#c3cdd420" } },
    ],
    series: [
      {},
      ...channels.map((c, i) => ({
        label: c,
        stroke: PALETTE[i % PALETTE.length],
        width: 2,
        points: { show: false },
      })),
    ],
  };
}

const Plotter = forwardRef<PlotterHandle>(function Plotter(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<uPlot | null>(null);

  const startTimeRef = useRef(0);
  const xRef = useRef<number[]>([]);
  const channelsRef = useRef<string[]>([]);
  const dataRef = useRef<Map<string, (number | null)[]>>(new Map());
  const scheduledRef = useRef(false);
  const dirtySeriesRef = useRef(false);

  function rebuildChart() {
    if (!containerRef.current) return;
    chartRef.current?.destroy();
    const { clientWidth, clientHeight } = containerRef.current;
    chartRef.current = new uPlot(
      buildOptions(clientWidth || 400, clientHeight || 240, channelsRef.current),
      undefined,
      containerRef.current,
    );
    dirtySeriesRef.current = false;
  }

  useEffect(() => {
    startTimeRef.current = performance.now();
    rebuildChart();

    const ro = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      chartRef.current.setSize({ width: clientWidth, height: clientHeight || 240 });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  function applySamples(samples: Sample[]) {
    if (samples.length === 0) return;
    const t = (performance.now() - startTimeRef.current) / 1000;
    const seen = new Set(samples.map((s) => s.channel));

    for (const s of samples) {
      if (!channelsRef.current.includes(s.channel)) {
        channelsRef.current.push(s.channel);
        dataRef.current.set(s.channel, new Array(xRef.current.length).fill(null));
        dirtySeriesRef.current = true;
      }
    }

    xRef.current.push(t);
    for (const c of channelsRef.current) {
      const arr = dataRef.current.get(c)!;
      const sample = samples.find((s) => s.channel === c);
      arr.push(seen.has(c) && sample ? sample.value : null);
    }

    if (xRef.current.length > MAX_SAMPLES) {
      const drop = xRef.current.length - MAX_SAMPLES;
      xRef.current.splice(0, drop);
      for (const arr of dataRef.current.values()) arr.splice(0, drop);
    }

    scheduleDraw();
  }

  function scheduleDraw() {
    if (scheduledRef.current) return;
    scheduledRef.current = true;
    requestAnimationFrame(() => {
      scheduledRef.current = false;
      if (dirtySeriesRef.current) rebuildChart();
      const aligned: uPlot.AlignedData = [
        xRef.current,
        ...channelsRef.current.map((c) => dataRef.current.get(c)!),
      ];
      chartRef.current?.setData(aligned);
    });
  }

  useImperativeHandle(
    ref,
    () => ({
      pushLine: (line: string) => applySamples(parseSampleLine(line)),
      clear: () => {
        xRef.current = [];
        channelsRef.current = [];
        dataRef.current.clear();
        startTimeRef.current = performance.now();
        rebuildChart();
      },
    }),
    // applySamples/rebuildChart yalnızca ref'lere kapanıyor, props/state'e değil —
    // handle kimliğinin sabit kalması kasıtlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return <div ref={containerRef} className="h-60 w-full" />;
});

export default Plotter;
