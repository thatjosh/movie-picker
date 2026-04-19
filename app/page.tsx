"use client";

import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

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
    const fs = Math.max(9, Math.min(12, 104 / movies.length + 4));
    ctx.font = `500 ${fs}px Georgia, 'Times New Roman', serif`;
    const label = (movie.length > 26 ? movie.slice(0, 25) + "…" : movie).toUpperCase();
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
  const [input, setInput] = useState("");
  const [remaining, setRemaining] = useState<string[]>([]);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const angleRef = useRef(0);
  const cancelRef = useRef(false);

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

  // Scale canvas to fit the right panel on any screen size
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Reserve ~80px for the Start button + gap below the canvas
      const availH = Math.max(0, height - 80);
      setCanvasScale(Math.min(1, width / SIZE, availH / SIZE));
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  function spinRound(movies: string[]): Promise<string> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current!;
      const extraSpins = 5 + Math.random() * 5;
      const totalRotation = Math.PI * 2 * extraSpins;
      const duration = 3000 + Math.random() * 1200;
      const startAngle = angleRef.current;
      const targetAngle = startAngle + totalRotation;
      const t0 = performance.now();

      function frame(now: number) {
        if (cancelRef.current) return;
        const t = Math.min((now - t0) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4);
        const angle = startAngle + (targetAngle - startAngle) * eased;
        angleRef.current = angle;
        drawWheel(canvas, angle, movies);

        if (t < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          const sliceAngle = (2 * Math.PI) / movies.length;
          const norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          const ptr = ((2 * Math.PI) - norm) % (2 * Math.PI);
          const idx = Math.floor(ptr / sliceAngle) % movies.length;
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

      await new Promise<void>((r) => setTimeout(r, 450));
      if (cancelRef.current) return;

      const next = current.filter((m) => m !== loser);
      current = next;

      setEliminated((prev) => [loser, ...prev]);
      setRemaining(next);

      if (next.length > 1) {
        await new Promise<void>((r) => setTimeout(r, 650));
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
    runGame(movies);
  }

  function reset() {
    cancelRef.current = true;
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
      <div className="w-full md:w-[346px] md:shrink-0 border-b md:border-b-0 md:border-r flex flex-col p-6 gap-5 md:overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Movie Picker</h1>
          <p className="text-sm text-muted-foreground mt-1">One per line</p>
        </div>

        <Textarea
          placeholder={"The Godfather\nInception\nInterstellar"}
          className="h-40 md:h-auto md:flex-1 resize-none font-mono text-base"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={started}
        />

        {eliminated.length > 0 && (
          <div className="shrink-0">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Eliminated
            </p>
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {eliminated.map((m) => {
                const display = m.length > 30 ? m.slice(0, 29) + "…" : m;
                return (
                  <li key={m} className="text-base text-muted-foreground line-through whitespace-nowrap">
                    {display.split("").map((char, ci) => (
                      <span
                        key={ci}
                        style={{
                          display: "inline-block",
                          animation: `char-fade-in 0.25s ease both`,
                          animationDelay: `${ci * 0.035}s`,
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
      <div ref={wrapperRef} className="flex-1 flex flex-col items-center justify-center gap-6 py-8 md:py-0">
        {winner ? (
          <div className="text-center space-y-3">
            <p className="text-muted-foreground text-sm uppercase tracking-widest">
              Tonight&apos;s pick
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
            <Button variant="outline" onClick={reset} className="mt-2 uppercase tracking-widest text-xs">
              Start Over
            </Button>
          </div>
        ) : inputMovies.length < 2 ? (
          <p className="text-muted-foreground text-sm">
            Add at least 2 movies to get started.
          </p>
        ) : (
          <>
            <div className="flex justify-center">
              <canvas
                ref={canvasRef}
                className="glow-flicker"
                style={{ width: SIZE, height: SIZE, zoom: canvasScale }}
              />
            </div>
            <Button onClick={start} disabled={!canStart} size="lg" className="w-36 uppercase tracking-widest text-xs">
              {spinning ? "Spinning…" : "Start"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
