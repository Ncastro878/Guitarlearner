/**
 * useSpokenNote — hands-free note answers via the Web Speech API.
 *
 * While enabled, it runs short one-utterance recognition sessions that
 * auto-restart (rather than one `continuous` session — Safari and Android
 * Chrome are unreliable in continuous mode, often never finalising results).
 * Interim results are shown live and finalised either when the recogniser
 * marks them final or after a short pause in speech — so "C sharp" isn't
 * submitted as "C" mid-utterance, but Safari's habit of never sending
 * `isFinal` still can't wedge us.
 *
 * Support is Chrome/Edge/Safari (webkit-prefixed); Firefox has no
 * SpeechRecognition. Some Chromium forks (e.g. Brave) expose the API but
 * block the speech service — that surfaces as an error message instead of
 * silence.
 */

import { useEffect, useRef, useState } from "react";
import { parseSpokenNote } from "../lib/speechNotes";
import type { PitchClass } from "../lib/theory";

/** Minimal typings — SpeechRecognition isn't in TS's dom lib everywhere. */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  error: string;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** How long after the last interim update an utterance counts as finished. */
const SETTLE_MS = 800;
/** Pause between sessions so restart loops can't spin hot. */
const RESTART_DELAY_MS = 150;

export interface UseSpokenNoteOptions {
  enabled: boolean;
  /** Fired once per utterance that names a note. */
  onNote: (pc: PitchClass) => void;
}

export function useSpokenNote({ enabled, onNote }: UseSpokenNoteOptions) {
  const isSupported = recognitionCtor() !== null;
  const [status, setStatus] = useState<"off" | "starting" | "listening">(
    "off",
  );
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");

  const onNoteRef = useRef(onNote);
  onNoteRef.current = onNote;

  useEffect(() => {
    if (!enabled) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;

    let disposed = false;
    let rec: Recognition | null = null;
    let settle: ReturnType<typeof setTimeout> | null = null;
    let restart: ReturnType<typeof setTimeout> | null = null;
    let handled = false; // current utterance already produced an answer
    let active = false; // a recognition session is currently running

    const finalize = (text: string) => {
      if (disposed || handled) return;
      const pc = parseSpokenNote(text);
      if (pc === null) return; // not a note — keep listening
      handled = true;
      onNoteRef.current(pc);
    };

    const spin = () => {
      if (disposed) return;
      const r = new Ctor();
      rec = r;
      handled = false;
      r.continuous = false;
      r.interimResults = true;
      r.lang = "en-US";

      r.onstart = () => {
        active = true;
        if (!disposed) setStatus("listening");
      };
      r.onresult = (e) => {
        let text = "";
        let hasFinal = false;
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i]?.[0]?.transcript ?? "";
          if (e.results[i]?.isFinal) hasFinal = true;
        }
        setTranscript(text.trim());
        if (settle) clearTimeout(settle);
        if (hasFinal) {
          finalize(text);
        } else {
          // Safari/Android often never mark results final — settle instead.
          settle = setTimeout(() => finalize(text), SETTLE_MS);
        }
      };
      r.onerror = (e) => {
        if (disposed) return;
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          setError(
            "Microphone permission for voice input was denied — allow it in the browser, then toggle Voice again.",
          );
          disposed = true;
          setStatus("off");
        } else if (e.error === "audio-capture") {
          setError("No microphone was found for voice input.");
        } else if (e.error === "network") {
          setError(
            "The browser's speech service couldn't be reached (some browsers, like Brave, block it — try Chrome, Edge or Safari).",
          );
        }
        // "no-speech" / "aborted" are routine — the restart loop handles them.
      };
      r.onend = () => {
        active = false;
        if (settle) clearTimeout(settle);
        settle = null;
        if (disposed) {
          setStatus("off");
          return;
        }
        // Hidden tab: release the mic and wait — the visibility listener
        // below restarts recognition when the player comes back.
        if (document.hidden) {
          setStatus("off");
          return;
        }
        // One-utterance sessions end constantly; start the next one.
        restart = setTimeout(spin, RESTART_DELAY_MS);
      };

      try {
        r.start();
        setStatus((s) => (s === "listening" ? s : "starting"));
      } catch {
        if (!disposed) setError("Could not start voice recognition.");
      }
    };

    // Release the mic when the tab is hidden (so background music isn't
    // interrupted) and pick recognition back up on return.
    const onVisibility = () => {
      if (disposed) return;
      if (document.hidden) {
        try {
          rec?.stop();
        } catch {
          /* already stopped */
        }
      } else if (!active) {
        spin();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    setError(null);
    setTranscript("");
    spin();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (settle) clearTimeout(settle);
      if (restart) clearTimeout(restart);
      if (rec) {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        try {
          rec.stop();
        } catch {
          /* already stopped */
        }
      }
      setStatus("off");
    };
  }, [enabled]);

  return {
    isSupported,
    status,
    isListening: status === "listening",
    error,
    transcript,
  };
}
