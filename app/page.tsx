"use client";

import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Typewriter } from "@/components/typewriter";

const SIZE = 520;

// Palette stops in exact user order: Ivory → Sage → Eerie Black → Moss
// H held near 68° through the black stop so hue never jumps to red during interpolation
const STOPS: Array<[number, number, number]> = [
  [60,  2, 88],  // Ethereal Ivory      #E4E4DE
  [66,  9, 75],  // Sophisticated Sage  #C4C5BA
  [68,  0, 11],  // Eerie Black         #1B1B1B  (S=0 → achromatic)
  [70, 25, 30],  // Muted Moss          #595f39
];

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

// Sample n colors evenly along Ivory → Sage → Black → Moss in sequence.
// No interleaving — colors flow smoothly around the wheel.
function generateColors(n: number): string[] {
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const scaled = t * (STOPS.length - 1);
    const si = Math.min(Math.floor(scaled), STOPS.length - 2);
    const lo = scaled - si;
    const [h1, s1, l1] = STOPS[si];
    const [h2, s2, l2] = STOPS[si + 1];
    return hslToHex(h1 + (h2 - h1) * lo, s1 + (s2 - s1) * lo, l1 + (l2 - l1) * lo);
  });
}

// Perceived brightness 0–1; drives dark vs ivory label text
function brightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function parseMovies(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

const DIVIDER = "#1B1B1B"; // Eerie Black — dividers, outer ring, center cap

function drawWheel(canvas: HTMLCanvasElement, angle: number, movies: string[]) {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.round(SIZE * dpr);
  const ph = Math.round(SIZE * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }

  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (movies.length === 0) return;

  const colors = generateColors(movies.length);
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const radius = SIZE / 2 - 28;
  const slice = (2 * Math.PI) / movies.length;

  // 1. Slices
  movies.forEach((_, i) => {
    const start = angle + i * slice;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + slice);
    ctx.closePath();
    ctx.fillStyle = colors[i];
    ctx.fill();
  });

  // 3. Labels — Eerie Black on light slices, Ivory on dark slices
  movies.forEach((movie, i) => {
    const mid = angle + i * slice + slice / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.shadowBlur = 0;
    ctx.fillStyle = brightness(colors[i]) > 0.52 ? "#1B1B1B" : "#E4E4DE";
    const fs = Math.max(13, Math.min(15, 120 / movies.length + 5));
    ctx.font = `500 ${fs}px Georgia, 'Times New Roman', serif`;
    const label = movie.length > 26 ? movie.slice(0, 25) + "…" : movie;
    ctx.fillText(label, radius - 14, fs / 3);
    ctx.restore();
  });

  // 5. Center cap
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
  ctx.fillStyle = DIVIDER;
  ctx.fill();

  // 6. Pointer — Ivory arrowhead on right edge
  const px = SIZE - 10;
  const py = cy;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(px, py - 12);
  ctx.lineTo(px + 8, py - 12);
  ctx.lineTo(px + 8, py + 12);
  ctx.lineTo(px, py + 12);
  ctx.lineTo(px - 30, py);
  ctx.closePath();
  ctx.fillStyle = "#E4E4DE";
  ctx.fill();
  ctx.restore();
}

export default function Home() {
  const [input, setInput] = useState("La La Land\nInception\nEdgerunners\nLove, Death + Robots\nDune\nKill Bill\nDemon Slayer");
  const [remaining, setRemaining] = useState<string[]>([]);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [skipUsed, setSkipUsed] = useState(false);
  const [canvasScale, setCanvasScale] = useState(() =>
    typeof window === "undefined" ? 1 : Math.min(1, window.innerWidth / SIZE, (window.innerHeight - 80) / SIZE)
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const angleRef = useRef(0);
  const cancelRef = useRef(false);
  const turboRef = useRef(false);
  const skipDelayRef = useRef<(() => void) | null>(null);
  const spinStateRef = useRef<{ startAngle: number; targetAngle: number; duration: number; t0: number } | null>(null);

  // Draw whenever remaining changes (idle redraws only)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || spinning) return;
    drawWheel(canvas, angleRef.current, remaining);
  }, [remaining, spinning]);

  // Live preview before game starts
  useEffect(() => {
    if (!started) setRemaining(parseMovies(input));
  }, [input, started]);

  // Recompute canvas scale whenever the wrapper mounts/unmounts (movies cross the >=2 threshold)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const availW = wrapper.getBoundingClientRect().width;
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      setCanvasScale(Math.min(1, (availW - 32) / SIZE) * 0.88);
    } else {
      const availH = window.innerHeight - 72;
      setCanvasScale(Math.min(1, availW / SIZE, availH / SIZE));
    }
  }, [remaining.length >= 2]);

  // Scale canvas to fit available space without feedback loops.
  // Observe the canvas wrapper (stable w-full width) and the left panel (height shifts the
  // available vertical space on mobile). Read height from window — never from the canvas
  // or right panel, which would loop when canvasScale changes.
  useEffect(() => {
    const leftPanel = leftPanelRef.current;

    function compute() {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const availW = wrapper.getBoundingClientRect().width;
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        setCanvasScale(Math.min(1, (availW - 32) / SIZE) * 0.88);
      } else {
        const availH = window.innerHeight - 72;
        setCanvasScale(Math.min(1, availW / SIZE, availH / SIZE));
      }
    }

    compute();
    const ro = new ResizeObserver(compute);
    if (leftPanel) ro.observe(leftPanel);
    window.addEventListener("resize", compute);
    return () => { ro.disconnect(); window.removeEventListener("resize", compute); };
  }, []);

  function skippableDelay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const id = setTimeout(resolve, ms);
      skipDelayRef.current = () => { clearTimeout(id); resolve(); };
    });
  }

  function spinRound(movies: string[]): Promise<string> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current!;
      const turbo = turboRef.current;
      const extraSpins = turbo ? 1 + Math.random() * 0.5 : 1 + Math.random() * 1.5;

      spinStateRef.current = {
        startAngle: angleRef.current,
        targetAngle: angleRef.current + Math.PI * 2 * extraSpins,
        duration: turbo ? 800 : 1500 + Math.random() * 600,
        t0: performance.now(),
      };

      function frame(now: number) {
        if (cancelRef.current) return;
        const s = spinStateRef.current!;
        const t = Math.min((now - s.t0) / s.duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        const angle = s.startAngle + (s.targetAngle - s.startAngle) * eased;
        angleRef.current = angle;
        drawWheel(canvas, angle, movies);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          const sliceAngle = (2 * Math.PI) / movies.length;
          const norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const ptr = ((2 * Math.PI) - norm) % (2 * Math.PI);
          const idx = Math.floor(ptr / sliceAngle) % movies.length;
          spinStateRef.current = null;
          resolve(movies[idx]);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    });
  }

  async function runGame(movies: string[]) {
    let current = movies;

    while (current.length > 1) {
      if (cancelRef.current) return;

      const loser = await spinRound(current);
      if (cancelRef.current) return;

      if (turboRef.current) await skippableDelay(60);
      else await skippableDelay(450);
      if (cancelRef.current) return;

      const next = current.filter((m) => m !== loser);
      current = next;

      setEliminated((prev) => [loser, ...prev]);
      setRemaining(next);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

      if (next.length > 1) {
        if (!turboRef.current) await skippableDelay(650);
      }
    }

    if (!cancelRef.current) {
      setWinner(current[0]);
      setSpinning(false);
    }
  }

  function start() {
    const movies = parseMovies(input);
    if (movies.length < 2) return;
    cancelRef.current = false;
    angleRef.current = 0;
    setStarted(true);
    setSpinning(true);
    setEliminated([]);
    setWinner(null);
    setRemaining(movies);
    // Draw the full wheel immediately, then spin
    const canvas = canvasRef.current;
    if (canvas) drawWheel(canvas, 0, movies);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    runGame(movies);
  }

  function handleFastForward() {
    setSkipUsed(true);
    turboRef.current = true;
    if (spinStateRef.current) {
      const s = spinStateRef.current;
      spinStateRef.current = { startAngle: angleRef.current, targetAngle: s.targetAngle, duration: 800, t0: performance.now() };
    }
    if (skipDelayRef.current) {
      const skip = skipDelayRef.current;
      skipDelayRef.current = null;
      skip();
    }
  }

  function reset() {
    cancelRef.current = true;
    turboRef.current = false;
    spinStateRef.current = null;
    setSkipUsed(false);
    if (skipDelayRef.current) {
      skipDelayRef.current();
      skipDelayRef.current = null;
    }
    cancelAnimationFrame(rafRef.current);
    angleRef.current = 0;
    setStarted(false);
    setSpinning(false);
    setEliminated([]);
    setWinner(null);
    setRemaining(parseMovies(input));
  }

  const inputMovies = parseMovies(input);
  const canStart = inputMovies.length >= 2 && !spinning && !winner;

  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-background">
      {/* Left panel — full width on mobile, fixed 346px sidebar on desktop */}
      <div ref={leftPanelRef} className="w-full md:w-[346px] md:shrink-0 border-b md:border-b-0 md:border-r flex flex-col p-6 gap-5 md:overflow-y-auto">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">
            <Typewriter text="Movie Picker" speed={75} />
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-sans">
            <Typewriter text="Edit the textbox, one movie per line" speed={40} />
          </p>
        </div>

        <div className="relative flex flex-col md:flex-1">
          <Textarea
            placeholder={"The Godfather\nInception\nInterstellar"}
            className="h-40 md:h-full resize-none font-mono text-sm"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={started}
          />
          {input.length > 0 && !started && (
            <button
              onClick={() => setInput("")}
              className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors text-xs uppercase tracking-widest"
            >
              Clear
            </button>
          )}
        </div>

        {eliminated.length > 0 && (
          <div className="shrink-0">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Eliminated
            </p>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {eliminated.map((m) => {
                const display = m.length > 30 ? m.slice(0, 29) + "…" : m;
                return (
                  <li key={m} className="text-sm text-muted-foreground whitespace-nowrap">
                    {display.split("").map((char, ci) => (
                      <span
                        key={ci}
                        style={{
                          display: "inline-block",
                          animation: `char-fade-in 0.25s ease both`,
                          animationDelay: `${ci * 0.035}s`,
                          textDecoration: "line-through",
                        }}
                      >
                        {char === " " ? "\u00a0" : char}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {started && (
          <Button variant="outline" onClick={reset} className="shrink-0 uppercase tracking-widest text-xs">
            Reset
          </Button>
        )}
      </div>

      {/* Right panel */}
      <div className="w-full md:flex-1 flex flex-col items-center justify-center gap-6 py-8 md:py-0">
        {winner ? (
          <div className="text-center space-y-3 px-8 py-6">
            <p className="text-muted-foreground text-sm uppercase tracking-widest">
              Today&apos;s pick
            </p>
            <p className="text-5xl font-bold">
              {[...winner, " ", "🎉"].map((char, ci) => (
                <span
                  key={ci}
                  style={{
                    display: "inline-block",
                    animation: "char-fade-in 0.3s ease both",
                    animationDelay: `${ci * 0.06}s`,
                  }}
                >
                  {char === " " ? "\u00a0" : char}
                </span>
              ))}
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <Button
                variant="outline"
                size="lg"
                className="uppercase tracking-widest text-xs"
                style={{ animation: "char-fade-in 0.3s ease both", animationDelay: `${(winner.length + 2) * 0.06 + 0.2}s`, opacity: 0 }}
                onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(winner)}`, "_blank", "noopener,noreferrer")}
              >
                Open
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={reset}
                className="uppercase tracking-widest text-xs"
                style={{ animation: "char-fade-in 0.3s ease both", animationDelay: `${(winner.length + 2) * 0.06 + 0.35}s`, opacity: 0 }}
              >
                Start Over
              </Button>
            </div>
          </div>
        ) : inputMovies.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Add at least 2 movies to get started.
          </p>
        ) : (
          <>
            <div ref={wrapperRef} className="w-full flex justify-center">
              <canvas
                ref={canvasRef}
                className="glow-flicker"
                style={{ width: SIZE * canvasScale, height: SIZE * canvasScale }}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={start} disabled={!canStart} size="lg" className="w-36 uppercase tracking-widest text-xs">
                {spinning ? "Spinning…" : "Start"}
              </Button>
              {spinning && (
                <Button variant="outline" onClick={handleFastForward} disabled={skipUsed} size="lg" className="w-36 uppercase tracking-widest text-xs disabled:pointer-events-auto disabled:cursor-not-allowed">
                  Turbo
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
