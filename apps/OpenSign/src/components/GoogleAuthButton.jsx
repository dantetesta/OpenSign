import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Parse from "parse";

let googleScript;

function loadGoogle() {
  if (window.google?.accounts?.id)
    return Promise.resolve(window.google.accounts.id);
  if (!googleScript) {
    googleScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => {
        if (window.google?.accounts?.id) resolve(window.google.accounts.id);
        else reject(new Error("Google Identity Services unavailable"));
      };
      script.onerror = () => {
        script.remove();
        reject(new Error("Google Identity Services unavailable"));
      };
      document.head.appendChild(script);
    }).catch((error) => {
      googleScript = undefined;
      throw error;
    });
  }
  return googleScript;
}

function googleRequest(path, payload) {
  const headers = { "Content-Type": "application/json" };
  if (payload.mode === "link") {
    const session = Parse.User.current()?.getSessionToken();
    if (session) headers["X-Parse-Session-Token"] = session;
  }
  return fetch(`/api/docsign-auth/google/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers,
    body: JSON.stringify(payload)
  }).then((response) => {
    if (!response.ok) throw new Error("Google sign-in unavailable");
    return response.json();
  });
}

const googleClientId = () =>
  window.RUNTIME_ENV?.REACT_APP_DOCSIGN_GOOGLE_CLIENT_ID;
export const isGoogleAuthEnabled = () => Boolean(googleClientId());

export default function GoogleAuthButton({ mode, onSuccess }) {
  const { t, i18n } = useTranslation();
  const container = useRef(null);
  const slot = useRef(null);
  const success = useRef(onSuccess);
  const [status, setStatus] = useState("loading");
  const [retry, setRetry] = useState(0);
  const [accessNote, setAccessNote] = useState(
    "docsign-google-signup-unavailable"
  );
  success.current = onSuccess;
  const clientId = googleClientId();
  const locale = i18n.resolvedLanguage === "kr" ? "ko" : i18n.resolvedLanguage;

  useEffect(() => {
    if (!clientId) return;
    let active = true;
    let submitted = false;
    let observer;
    const target = container.current;
    const buttonSlot = slot.current;
    setStatus("loading");
    async function prepare() {
      const state = await googleRequest("challenge", { mode });
      if (!active) return;
      if (state.signupEnabled) {
        setAccessNote("docsign-google-signup-available");
      } else if (state.directGmailEnabled) {
        setAccessNote("docsign-google-registered-gmail");
      }
      if (state.linked) {
        setStatus("linked");
        return;
      }
      if (!state.nonce) throw new Error("Google sign-in challenge missing");
      const api = await loadGoogle();
      if (!active || !target || !buttonSlot) return;
      api.initialize({
        client_id: clientId,
        nonce: state.nonce,
        ux_mode: "popup",
        callback: async ({ credential }) => {
          if (!active || submitted || !credential) return;
          submitted = true;
          setStatus("pending");
          try {
            const result = await googleRequest("complete", {
              mode,
              nonce: state.nonce,
              credential
            });
            if (!active) return;
            if (mode === "link" && result.linked) {
              setStatus("linked");
            } else if (
              mode === "login" &&
              result.sessionToken &&
              success.current
            ) {
              await success.current(result.sessionToken);
            } else {
              throw new Error("Google sign-in not completed");
            }
          } catch {
            if (active) setStatus("error");
          }
        }
      });
      let renderedWidth;
      function render() {
        const width = Math.min(
          mode === "login" ? 400 : 236,
          buttonSlot.clientWidth
        );
        if (!active || submitted || width === 0 || width === renderedWidth)
          return;
        renderedWidth = width;
        target.replaceChildren();
        api.renderButton(target, {
          type: "standard",
          theme: mode === "login" ? "filled_blue" : "outline",
          size: "large",
          text: "continue_with",
          logo_alignment: "left",
          locale,
          width
        });
        setStatus("ready");
      }
      render();
      observer = new ResizeObserver(render);
      observer.observe(buttonSlot);
    }
    prepare().catch(() => {
      if (active) setStatus("error");
    });
    return () => {
      active = false;
      observer?.disconnect();
      target?.replaceChildren();
    };
  }, [clientId, locale, mode, retry]);

  if (!clientId) return null;
  return (
    <div className={mode === "login" ? "os-login-google" : "mt-3"}>
      {status === "linked" && <p role="status">{t("docsign-google-linked")}</p>}
      {status === "error" && (
        <div className={mode === "login" ? "os-login-google-error" : "text-sm"}>
          <p role="alert">
            {t(
              mode === "login"
                ? "docsign-google-login-error"
                : "docsign-google-error"
            )}
          </p>
          <button
            type="button"
            className="op-link"
            onClick={() => setRetry((value) => value + 1)}
          >
            {t("docsign-google-retry")}
          </button>
        </div>
      )}
      <div
        ref={slot}
        className="os-google-slot"
        hidden={status === "linked" || status === "error"}
      >
        {(status === "loading" || status === "pending") && (
          <p className="os-login-google-status" role="status">
            {t("docsign-google-loading")}
          </p>
        )}
        <div ref={container} hidden={status !== "ready"} />
      </div>
      {mode === "login" && (
        <p className="os-login-google-note">{t(accessNote)}</p>
      )}
    </div>
  );
}
