"use client";

import { useState, useEffect } from "react";

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({ text, speed = 75, delay = 0, className }: TypewriterProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(() => {
      let i = 0;
      interval = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(interval); setDone(true); }
      }, speed);
    }, delay);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [text, speed, delay]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="animate-pulse">|</span>}
    </span>
  );
}
