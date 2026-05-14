import React from "react";

import { LegalDocumentScreen } from "@/components/legal-document-screen";

const sections = [
  {
    title: "What Guardian Circle stores",
    body:
      "Guardian Circle stores the account details you enter, your trusted contacts, your alert records, and the latest location shared on each alert. It also stores watcher-link records prepared for emergency contacts on an alert.",
  },
  {
    title: "Location retention",
    body:
      "The current product stores the latest location attached to an alert record until you delete that alert history or delete your account. Guardian Circle does not promise a fixed automatic deletion schedule for alert locations in this MVP.",
  },
  {
    title: "Local device storage",
    body:
      "Your phone also stores local session data such as your sign-in token, onboarding acknowledgement, SOS preferences, and active SOS restoration state so the app can keep working between launches.",
  },
  {
    title: "Shared links and messages",
    body:
      "If you share a watcher link or send a message through your phone or another service, copies may remain outside Guardian Circle. Deleting history in Guardian Circle does not erase messages already delivered by SMS, WhatsApp, email, or another app.",
  },
  {
    title: "Your controls",
    body:
      "You can remove trusted contacts, delete past alert history, or delete your account from the app. Deleting your account removes your Guardian Circle account data, contacts, alerts, and saved watcher records from this product.",
  },
  {
    title: "Accuracy and limits",
    body:
      "Location data can be delayed, incomplete, or inaccurate. Guardian Circle is designed to assist communication and coordination, not to guarantee precise tracking or emergency response.",
  },
] as const;

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      title="Guardian Circle Privacy"
      intro="This screen explains the data Guardian Circle keeps in the current product and the controls available to you. It is written for readability rather than legal shorthand."
      sections={sections}
      footer="If data practices change later, the in-app privacy text should be updated to match the product honestly."
    />
  );
}
