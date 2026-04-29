"use client";

import { useEffect, useState } from "react";

export enum RevealSpeed {
  VeryFast = 5,
  Fast = 20,
  Moderate = 50,
  ModeratelySlow = 100,
  Slow = 150,
}

const bitOrSpace = (ch: string): string =>
  ch === " " ? " " : Math.floor(Math.random() * 2).toString();

interface GlitchProps {
  content: string;
  revealSpeed?: RevealSpeed;
  glitchTime?: number;
  className?: string;
}

export function Glitch({
  content,
  revealSpeed = RevealSpeed.Fast,
  glitchTime = 600,
  className,
}: GlitchProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    let revealIndex = 0;
    let revealing = false;

    setText(Array.from(content).map(bitOrSpace).join(""));

    const tick = setInterval(() => {
      if (revealing && revealIndex >= content.length) {
        clearInterval(tick);
        setText(content);
        return;
      }
      setText(
        Array.from(content)
          .map((ch, i) =>
            revealing && i < revealIndex ? content[i] : bitOrSpace(ch),
          )
          .join(""),
      );
      if (revealing) revealIndex++;
    }, revealSpeed);

    const startReveal = setTimeout(() => {
      revealing = true;
    }, glitchTime);

    return () => {
      clearInterval(tick);
      clearTimeout(startReveal);
    };
  }, [content, revealSpeed, glitchTime]);

  return <span className={className}>{text}</span>;
}
