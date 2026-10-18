"use client";

import { useState } from "react";

// Participant information sheet + consent gate.
// Nothing is recorded until the participant ticks consent and continues — this is what the
// Ethical Clearance application declares, so the gate must stay in front of every study question.
//
// LAYERED, NOT SHORTENED. The full approved information sheet is still on this screen, in full, in
// its approved wording — it is inside an expandable panel rather than being the first 1,200 words a
// participant meets. The plain-language summary above it says the same things in fewer words, and
// each consent item is ticked separately so consent stays specific rather than one blanket box.
// Nothing has been removed, softened, or moved to another page: the change is the order things are
// read in, which is a presentation decision, not an ethics one.
//
// TODO before launch: replace the [BRACKETED] placeholders with the real researcher details, and
// keep this text in step with whatever the ethics committee approves.

export default function ConsentScreen({
  onConsent,
  onDecline,
}: {
  onConsent: () => void;
  onDecline: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [adult, setAdult] = useState(false);
  const ready = agreed && adult;

  return (
    <div className="card">
      <p className="eyebrow">Research study</p>
      <h1 className="question">Before you start</h1>
      <p className="hint">
        You are invited to take part in a student research study. Here is the short version — the
        full approved information sheet is at the bottom of this page if you want all of it.
      </p>

      <p className="section-label">The short version</p>
      <ul className="consent-summary">
        <li>
          <strong>What it is.</strong> An undergraduate dissertation at NIBM, School of Computing
          &amp; Engineering, looking at how the <em>design</em> of a health questionnaire affects how
          easy it is to complete.
        </li>
        <li>
          <strong>What you do.</strong> Answer questions about six areas of everyday health, then a
          few questions about how you found it. About 8–10 minutes. You get a 0–100 score for each
          area and an overall score.
        </li>
        <li>
          <strong>Taking part is your choice.</strong> You can stop at any point by closing the page.
          You do not have to give a reason, and nothing happens if you stop. If you stop partway, we
          keep only a note that the questionnaire was started and which version you saw, never your
          answers.
        </li>
        <li>
          <strong>You are anonymous.</strong> No name, email, phone number or IP address is
          collected. Because of that, your answers cannot be picked out and withdrawn once sent.
        </li>
        <li>
          <strong>Your data.</strong> Stored encrypted on a secure database, seen only by the
          researcher, used only for this dissertation, and deleted after it has been marked.
        </li>
      </ul>

      <p className="note note-warn">
        This is a <strong>wellbeing questionnaire, not a medical diagnosis</strong>. It does not
        replace advice from a doctor or other health professional. Some questions ask about stress,
        alcohol and smoking — you are free to stop rather than answer, and the results screen says
        where to get support.
      </p>

      {/* The full approved sheet, one tap away on the same screen. One addition since approval: the
          start-marker disclosure under "What data is collected?" (decision D33). */}
      <details className="disclosure">
        <summary>Read the full information sheet</summary>
        <div className="disclosure-body">
          <p className="section-label">What is this study about?</p>
          <p className="hint">
            This study is part of an undergraduate dissertation at the National Institute of Business
            Management (NIBM), School of Computing &amp; Engineering. It looks at how the{" "}
            <em>design</em> of a health questionnaire affects how easy it is to complete. You will
            answer questions about six areas of everyday health — physical activity, sleep,
            nutrition, stress, social connection, and alcohol and tobacco — and receive a 0–100 score
            for each, plus an overall score.
          </p>

          <p className="section-label">What will I have to do?</p>
          <p className="hint">
            Answer the questions and then a few short questions about how you found the experience.
            It takes about <strong>8–10 minutes</strong>. You will be shown one of two versions of
            the questionnaire, chosen at random — this is what the study compares.
          </p>

          <p className="section-label">Do I have to take part?</p>
          <p className="hint">
            No. Taking part is voluntary. You can stop at any point by simply closing the page — you
            do not have to give a reason, and nothing happens if you stop. The questionnaires are
            established, validated ones that need every question answered to produce a valid score,
            so individual questions cannot be skipped; if you would rather not answer something,
            please stop instead.
          </p>

          <p className="section-label">What data is collected?</p>
          <p className="hint">
            Your answers, and how long you spent on each question. When you agree to take part, a
            note is also kept that the questionnaire was started and which version you saw, so that
            the study can tell how many people finish; if you stop partway, that note is all that is
            kept.{" "}
            <strong>No name, email, phone number or IP address is collected</strong>, so your
            responses cannot be traced back to you. Because the data is anonymous, it cannot be
            identified and withdrawn once you have submitted it.
          </p>

          <p className="section-label">How is my data protected?</p>
          <p className="hint">
            Data is stored on a secure database, encrypted, and accessible only to the researcher. It
            is used only for this dissertation, handled in line with Sri Lanka&apos;s Personal Data
            Protection Act No. 9 of 2022, and permanently deleted after the dissertation has been
            marked.
          </p>

          <p className="section-label">Are there any risks?</p>
          <p className="hint">
            The risks are low. Some questions ask about stress, alcohol and smoking, which a few
            people may find uncomfortable. You are free to stop at that point rather than answer. If
            anything raises a concern for you, the results screen includes suggestions on where to
            get support.
          </p>

          <p className="section-label">Questions or concerns?</p>
          <p className="hint">
            Contact the researcher at <strong>[STUDENT EMAIL]</strong>, or the supervisor at{" "}
            <strong>[SUPERVISOR EMAIL]</strong>. Concerns about how the study is being run can be
            raised with the NIBM Ethics Committee at <strong>ethics-soce@nibm.lk</strong>.
          </p>
        </div>
      </details>

      {/* Ticked separately, so consent is specific rather than one blanket box. Both are required
          here — there is no optional item in this protocol, and each is marked so. */}
      <div className="consent-box">
        <label className="consent-line">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>
            I am 18 years of age or older.
            <span className="consent-tag required">Required</span>
          </span>
        </label>
        <label className="consent-line">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>
            I have read and understood the information above, and I agree to take part.
            <span className="consent-tag required">Required</span>
            <span className="consent-sub">
              You can still stop at any point after this — ticking it does not commit you to
              finishing.
            </span>
          </span>
        </label>
      </div>

      <div className="actions">
        <button className="btn btn-ghost" onClick={onDecline}>
          No thanks
        </button>
        {/* The label says why it is not yet available, rather than a dead grey "Continue". */}
        <button className="btn btn-primary" onClick={onConsent} disabled={!ready}>
          {ready ? "Agree and start" : "Tick both boxes to start"}
        </button>
      </div>
    </div>
  );
}
