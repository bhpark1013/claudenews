import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Generated rather than committed as a PNG: the card is a picture of the
// status line, which is the whole product, and keeping it as code means it
// cannot fall out of sync with the copy the way a screenshot does.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#0b0d10",
          color: "#e6e9ef",
          padding: "0 84px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", fontSize: 30, color: "#7c8595" }}>
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.15,
            marginTop: 18,
          }}
        >
          <div style={{ display: "flex" }}>Dev news,</div>
          <div style={{ display: "flex" }}>while AI thinks.</div>
        </div>

        {/* The status line itself, rendered the way the plugin draws it. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 56,
            padding: "26px 32px",
            borderRadius: 14,
            background: "#15181e",
            border: "1px solid #262b34",
            fontSize: 28,
          }}
        >
          <div style={{ display: "flex", color: "#56b6c2" }}>HackerNews</div>
          {/* A drawn rule, not the "│" the terminal uses: the OG renderer's
              font has no glyph for it and emits a tofu box. */}
          <div
            style={{
              display: "flex",
              width: 1,
              height: 30,
              background: "#4b5263",
              margin: "0 18px",
            }}
          />
          <div style={{ display: "flex", color: "#e6e9ef" }}>
            Nine coding harnesses vs. your laptop
          </div>
          <div style={{ display: "flex", color: "#e5c07b", paddingLeft: 20 }}>
            ▲46
          </div>
        </div>

        <div
          style={{ display: "flex", marginTop: 34, fontSize: 26, color: "#7c8595" }}
        >
          Hacker News · GitHub Trending · your own feeds — in Claude Code
        </div>
      </div>
    ),
    size
  );
}
