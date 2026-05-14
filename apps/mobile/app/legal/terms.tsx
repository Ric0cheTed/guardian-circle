import React from "react";

import { LegalDocumentScreen } from "@/components/legal-document-screen";

const sections = [
  {
    title: "Assistive use only",
    body:
      "Guardian Circle is an assistive personal safety tool. It can help you create an SOS alert, share updates with chosen contacts, and open your phone dialer to 999. It does not dispatch police, ambulance, fire, or any other authority automatically.",
  },
  {
    title: "No guaranteed outcome",
    body:
      "Using Guardian Circle does not guarantee help, response, rescue, message delivery, location accuracy, or service availability. Networks, devices, permissions, batteries, and mapping data can all fail or become delayed.",
  },
  {
    title: "Your decisions and emergency calls",
    body:
      "You remain responsible for deciding when to call emergency services, what information to share, and which contacts to notify. The app helps you communicate faster, but it does not replace your judgment or local emergency guidance.",
  },
  {
    title: "Accounts and shared contacts",
    body:
      "You are responsible for the account details and trusted contact information you enter. Before sharing someone else's phone number, make sure you have a lawful and appropriate reason to do so.",
  },
  {
    title: "Watcher links",
    body:
      "Guardian Circle can prepare read-only watcher links for alert updates. Anyone with an active link may be able to view the current alert state and the latest location shared for that alert until the link expires or the related records are deleted.",
  },
  {
    title: "Availability and changes",
    body:
      "We may update, limit, or remove features as the product evolves. Some features may be unavailable in certain builds, on certain devices, or when permissions are denied.",
  },
] as const;

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      title="Guardian Circle Terms"
      intro="These screens summarize how Guardian Circle works today in this MVP stage. They are provided in-app so you can read them with standard accessibility tools."
      sections={sections}
      footer="If you do not agree with these terms, do not rely on Guardian Circle for emergency coordination."
    />
  );
}
