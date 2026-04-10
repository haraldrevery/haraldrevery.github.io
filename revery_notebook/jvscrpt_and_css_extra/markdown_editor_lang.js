// Safely initialize global language (checking storage to prevent English flash on boot)
window.uiLanguage = 'English';
try {
  const stored = localStorage.getItem('revery_md_settings');
  if (stored) {
    const s = JSON.parse(stored);
    if (s.uiLanguage) window.uiLanguage = s.uiLanguage;
  }
} catch (e) {}

// ── Translation Engine ───────────────────────────────────────────────────
window.uiTranslations = {
  // Panes & Topbar
  "Markdown": { "Swedish": "Markdown" },
  "Preview": { "Swedish": "Förhandsgranskning" },
  "Outline": { "Swedish": "Disposition" },
  "File ▾": { "Swedish": "Arkiv ▾" },
  "File": { "Swedish": "Arkiv" },
  "Settings ▾": { "Swedish": "Inställningar ▾" },
  "Set.": { "Swedish": "Inst." },
  "Toolbar ▾": { "Swedish": "Verktyg ▾" },
  "Tool.": { "Swedish": "Verk." },
  "Export .md": { "Swedish": "Exportera .md" },
  "Export": { "Swedish": "Export" },
  "Reader Mode": { "Swedish": "Läsläge" },
  "Exit Reader Mode": { "Swedish": "Avsluta läsläge" },
  "Nothing here yet": { "Swedish": "Inget här ännu" },
  "Untitled": { "Swedish": "Namnlös" },
  "Start writing…": { "Swedish": "Börja skriva…" },
  "Editor": { "Swedish": "Redigerare" },
  
  // Settings Menu Items
  "Show Preview": { "Swedish": "Visa förhandsgranskning" },
  "Show Outline": { "Swedish": "Visa disposition" },
  "Mobile View": { "Swedish": "Mobilvy" },
  "Reader padding ▸": { "Swedish": "Läsläge marginal ▸" },
  "Calendar format ▸": { "Swedish": "Kalenderformat ▸" },
  "Filename format ▸": { "Swedish": "Filnamnsformat ▸" },
  "Editor text size ▸": { "Swedish": "Redig. textstorlek ▸" },
  "Editor font type ▸": { "Swedish": "Redig. typsnitt ▸" },
  "Preview text size ▸": { "Swedish": "Förh.granskn. textstorlek ▸" },
  "Preview font type ▸": { "Swedish": "Förh.granskn. typsnitt ▸" },
  "Outline font size ▸": { "Swedish": "Disposition textstorlek ▸" },
  "UI menu size ▸": { "Swedish": "UI-meny storlek ▸" },
  "Language ▸": { "Swedish": "Språk ▸" },
  "English": { "Swedish": "Engelska" },
  "Swedish": { "Swedish": "Svenska" },
  "CPU performance delay ▸": { "Swedish": "CPU-fördröjning ▸" },
  "Forced Prev. Synch": { "Swedish": "Tvinga förhandsgr. synk" },
  "Deactivate Right Click": { "Swedish": "Inaktivera högerklick" },
  "Center Headers": { "Swedish": "Centrera rubriker" },
  
  // File Menu
  "New File": { "Swedish": "Ny fil" },
  "Import File": { "Swedish": "Importera fil" },
  "Import Template ▸": { "Swedish": "Importera mall ▸" },
  "Save as...": { "Swedish": "Spara som..." },
  "Export as .md": { "Swedish": "Exportera som .md" },
  "Export as .txt": { "Swedish": "Exportera som .txt" },
  
  // Toolbar Menu & Context Menu
  "Cut (Marked)": { "Swedish": "Klipp (markerat)" },
  "Copy (Marked)": { "Swedish": "Kopiera (markerat)" },
  "Paste": { "Swedish": "Klistra in" },
  "Insert Date": { "Swedish": "Infoga datum" },
  "Ordered List (Marked)": { "Swedish": "Numrerad lista (markerad)" },
  "Unordered List (Marked)": { "Swedish": "Punktlista (markerad)" },
  "Clear Format (Marked)": { "Swedish": "Rensa formatering (markerad)" },
  "Bold (Ctrl+B)": { "Swedish": "Fet (Ctrl+B)" },
  "Italic (Ctrl+I)": { "Swedish": "Kursiv (Ctrl+I)" },
  "Heading": { "Swedish": "Rubrik" },
  "Strikethrough": { "Swedish": "Genomstruken" },
  "Code Block": { "Swedish": "Kodblock" },
  "Inline Code": { "Swedish": "Inline-kod" },
  "Link": { "Swedish": "Länk" },
  "Image": { "Swedish": "Bild" },
  "Task List": { "Swedish": "Att göra-lista" },
  "Horizontal Rule": { "Swedish": "Horisontell linje" },
  "Footnote": { "Swedish": "Fotnot" },
  "Copy MD": { "Swedish": "Kopiera MD" },
  "Insert YAML ▸": { "Swedish": "Infoga YAML ▸" },
  
  // Modals & UI Actions
  "Find…": { "Swedish": "Sök…" },
  "Replace…": { "Swedish": "Ersätt…" },
  "Find": { "Swedish": "Sök" },
  "Replace": { "Swedish": "Ersätt" },
  "All": { "Swedish": "Alla" },
  "Replace all": { "Swedish": "Ersätt alla" },
  "Close": { "Swedish": "Stäng" },
  "Save As": { "Swedish": "Spara som" },
  "Enter filename (will be saved as .md):": { "Swedish": "Ange filnamn (sparas som .md):" },
  "Save": { "Swedish": "Spara" },
  "Cancel": { "Swedish": "Avbryt" },
  "Insert Table": { "Swedish": "Infoga tabell" },
  "Rows:": { "Swedish": "Rader:" },
  "Columns:": { "Swedish": "Kolumner:" },
  "Rows": { "Swedish": "Rader" },
  "Columns": { "Swedish": "Kolumner" },
  "Insert": { "Swedish": "Infoga" },
  "No results": { "Swedish": "Inga träffar" },
  "Previous": { "Swedish": "Föregående" },
  "Next": { "Swedish": "Nästa" },
  
  // Word count & Status
  "word": { "Swedish": "ord" },
  "words": { "Swedish": "ord" },
  "File saved": { "Swedish": "Filen sparades" },
  "No headings": { "Swedish": "Inga rubriker" },
  "Properties": { "Swedish": "Egenskaper" },
  "Copy": { "Swedish": "Kopiera" },
  "Copied!": { "Swedish": "Kopierad!" },
  
  // Quit Modal
  "Quit Editor": { "Swedish": "Avsluta redigeraren" },
  "Do you want to export your current work before quitting? Unsaved text will be lost.": { "Swedish": "Vill du exportera ditt nuvarande arbete innan du avslutar? Osparad text kommer att förloras." },
  "Engine Stopped": { "Swedish": "Programmet avslutad" },
  "The editor engine has been safely shut down. What would you like to do next?": { "Swedish": "Redigeringsmotorn har stängts av på ett säkert sätt. Vad vill du göra härnäst?" },
  "Restart Editor": { "Swedish": "Starta om redigeraren" },
  "Total Factory Reset": { "Swedish": "Total återställning" },
  "Leave Site": { "Swedish": "Lämna sidan" },
  "Don't Save": { "Swedish": "Spara inte" },
  "Export & Continue": { "Swedish": "Exportera & Fortsätt" },
  "Don't Export": { "Swedish": "Exportera Inte" },
  "Total Reset": { "Swedish": "Total Återställning" },
  "Restart": { "Swedish": "Starta Om" },
  "Leave": { "Swedish": "Lämna" },
  
  // New/Import Modal
  "Unsaved Changes": { "Swedish": "Osparade ändringar" },
  "Do you want to export your current work before starting a new file? If you don't export, your current text will be lost forever.": { "Swedish": "Vill du expotera ditt nuvarande arbete innan du påbörjar en ny fil? Om du inte expoterar kommer din nuvarande text att förloras för alltid." },
  "Do you want to export your current work before importing a new file? If you don't export, your current text will be lost forever.": { "Swedish": "Vill du expotera ditt nuvarande arbete innan du importerar en ny fil? Om du inte expoterar kommer din nuvarande text att förloras för alltid." },
  "Yes, Export": { "Swedish": "Ja, exportera" },
  "No, Delete it": { "Swedish": "Nej, radera den" },
  
  // Date modal
  "Select Date": { "Swedish": "Välj datum" },

// Logo Menu
  "About": { "Swedish": "Om" },
  "Legal": { "Swedish": "Juridiskt" },
  "User Guide": { "Swedish": "Användarhandbok" },
  "Quit / Exit": { "Swedish": "Avsluta" },

// Templates
  "Recipe": { "Swedish": "Recept" },
  "To do": { "Swedish": "Att göra" },
  "Workout program": { "Swedish": "Träningsprogram" },
  "Grocery list": { "Swedish": "Inköpslista" },
  "Blog Post": { "Swedish": "Blogginlägg" },
  "LLM Entry": { "Swedish": "LLM-inlägg" },

  // Submenu Formats & Fonts
  "Long Date": { "Swedish": "Långt datum" },
  "None  —  Title.md": { "Swedish": "Ingen  —  Titel.md" },
  "Date suffix  —  Title_YYYY-MM-DD": { "Swedish": "Datum-suffix  —  Titel_ÅÅÅÅ-MM-DD" },
  "Datetime suffix  —  Title_YYYY-MM-DD_HH-MM-SS": { "Swedish": "Datumtid-suffix  —  Titel_ÅÅÅÅ-MM-DD_TT-MM-SS" },
  "Time suffix  —  Title_HH-MM-SS": { "Swedish": "Tid-suffix  —  Titel_TT-MM-SS" },
  "Date prefix  —  YYYY-MM-DD_Title": { "Swedish": "Datum-prefix  —  ÅÅÅÅ-MM-DD_Titel" },
  "Compact prefix  —  YYYYMMDD_Title": { "Swedish": "Kompakt prefix  —  ÅÅÅÅMMDD_Titel" },
  "Harald Revery Font": { "Swedish": "Harald Revery Typsnitt" },
  "System Sans-Serif": { "Swedish": "System Sans-Serif" },
  "System Serif": { "Swedish": "System Serif" },
  "System Monospace": { "Swedish": "System Monospace" },
  "Arial": { "Swedish": "Arial" },
  "Times New Roman": { "Swedish": "Times New Roman" },
  "Courier New": { "Swedish": "Courier New" },

  // Tooltips & Hidden Elements
  "Harald Revery — Menu": { "Swedish": "Harald Revery — Meny" },
  "Match Case": { "Swedish": "Matcha gemener/versaler" },
  "Regular Expression": { "Swedish": "Reguljära uttryck" },
  "Previous match (Shift+Enter)": { "Swedish": "Föregående träff (Shift+Enter)" },
  "Next match (Enter)": { "Swedish": "Nästa träff (Enter)" },
  "Close (Escape)": { "Swedish": "Stäng (Escape)" },
  "Replace current match (Enter)": { "Swedish": "Ersätt aktuell träff (Enter)" },
  "Replace all matches": { "Swedish": "Ersätt alla träffar" }
};

window.uiTemplates = {
  legal: {
    English: `
      <!-- ── 1. Ownership & Intellectual Property ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Ownership &amp; Intellectual Property</h4>
        <p style="margin: 0 0 8px;">Revery Notebook is designed, developed, and operated by <strong>Harald Mark Thirslund</strong>, Göteborg (Gothenburg), Sweden.</p>
        <p style="margin: 0 0 8px;">The following are the exclusive intellectual property of Harald Mark Thirslund and are protected under applicable Swedish, EU, and international copyright and trademark law:</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li>The <strong>HaraldText</strong> and <strong>HaraldMono</strong> typefaces ("Harald Revery Font").</li>
          <li>All logo graphics, image assets, and visual brand elements used on this website.</li>
          <li>The application source code authored by Harald Mark Thirslund.</li>
          <li>All original written content published on haraldrevery.com.</li>
        </ul>
        <p style="margin: 0;">Unauthorised reproduction, redistribution, or commercial use of these assets is strictly prohibited without prior written consent from Harald Mark Thirslund.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 2. Terms of Use ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Terms of Use</h4>
        <p style="margin: 0 0 8px;">By accessing or using Revery Notebook you agree to these terms. If you do not agree, please discontinue use immediately.</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li>Revery Notebook is a personal productivity tool. You may use it for any lawful purpose.</li>
          <li>You are solely responsible for the content you create, store, or export using this application.</li>
          <li>You must not use this tool to create, store, or distribute unlawful, harmful, or infringing content.</li>
          <li>Harald Mark Thirslund reserves the right to modify or discontinue the service at any time without notice.</li>
        </ul>
        <p style="margin: 0;">These terms are governed by the laws of Sweden and, where applicable, the laws of the European Union.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 3. Local Data Storage ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Local Data Storage</h4>
        <p style="margin: 0 0 8px;">Revery Notebook stores data <strong>exclusively on your own device</strong> using your browser's <code style="font-family: var(--font-mono); font-size: 0.85em;">localStorage</code> API. The following data is stored locally:</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li><strong>Document content</strong> — the markdown text you are currently editing (key: <code style="font-family: var(--font-mono); font-size: 0.85em;">revery_md_autosave</code>).</li>
          <li><strong>Editor preferences</strong> — UI settings such as theme, layout, and font sizes (key: <code style="font-family: var(--font-mono); font-size: 0.85em;">revery_md_settings</code>).</li>
        </ul>
        <p style="margin: 0 0 8px;"><strong>No data is ever transmitted to any server.</strong> Harald Mark Thirslund has no access to, and does not collect, any content you write in this editor.</p>
        <p style="margin: 0;">You can delete all locally stored data at any time by clearing your browser's site data for this domain, or by using the "Total Reset" option in the File menu.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 4. Cookies & Tracking ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Cookies &amp; Tracking</h4>
        <p style="margin: 0 0 8px;">Revery Notebook does <strong>not</strong> use cookies, tracking pixels, analytics scripts, advertising networks, or any third-party data collection technology.</p>
        <p style="margin: 0;">No personal data is shared with or sold to any third party. No user profiling or behavioural tracking takes place.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 5. Privacy Policy ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Privacy Policy</h4>

        <p style="margin: 0 0 6px; font-weight: 600;">EU / EEA — General Data Protection Regulation (GDPR)</p>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund is the data controller under the GDPR (Regulation (EU) 2016/679). Because Revery Notebook processes no personal data on any server and collects no identifying information, the GDPR's data minimisation and purpose-limitation principles are satisfied by design. The only data processed is content you voluntarily create, which is stored solely in your own browser and never leaves your device. You may exercise your rights (access, erasure, portability, restriction, objection) by clearing your own browser storage. For questions, contact: <strong>contact@haraldrevery.com</strong>.</p>

        <p style="margin: 0 0 6px; font-weight: 600;">North America — CCPA &amp; Canadian Privacy Law</p>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund does not sell, rent, or trade any personal information. No personal information as defined under the California Consumer Privacy Act (CCPA / CPRA) or Canada's Personal Information Protection and Electronic Documents Act (PIPEDA) / Quebec Law 25 is collected via this application. California residents and Canadian residents therefore have no personal data held by Harald Mark Thirslund that is subject to access, deletion, or opt-out requests.</p>

        <p style="margin: 0 0 6px; font-weight: 600;">Australia — Privacy Act 1988 (Cth)</p>
        <p style="margin: 0;">Revery Notebook does not collect personal information as defined by the Australian Privacy Act 1988 and the Australian Privacy Principles (APPs). No personal information is held, used, or disclosed by Harald Mark Thirslund in connection with this application.</p>
        <p style="margin: 0;">Revery Notebook is not intended for use by children under the age of 13. By using this service, you represent that you are of legal age to form a binding contract.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 6. Third-Party Libraries ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Third-Party Library Licences</h4>
        <p style="margin: 0 0 10px;">Revery Notebook is built using the following open-source libraries. Each is used in unmodified or minified form and is subject to its respective licence:</p>

        <div style="display: flex; flex-direction: column; gap: 10px;">

          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it</strong> v14 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT Licence</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2014 Vitaly Puzrin, Alex Kocharin. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following condition: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.</p>
          </div>

          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it-footnote</strong> v4 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT Licence</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2014 Vitaly Puzrin, Alex Kocharin. Same MIT Licence terms as markdown-it above apply. Source: github.com/markdown-it/markdown-it-footnote.</p>
          </div>

          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>highlight.js</strong> &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">BSD 3-Clause Licence</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2006 Ivan Sagalaev. Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met: (1) Redistributions of source code must retain the above copyright notice, this list of conditions, and the following disclaimer. (2) Redistributions in binary form must reproduce the above copyright notice, this list of conditions, and the following disclaimer in the documentation and/or other materials provided with the distribution. (3) Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission. THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.</p>
          </div>

          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>KaTeX</strong> &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT Licence</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2013–2020 Khan Academy and other contributors. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following condition: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.</p>
          </div>

          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it-texmath</strong> (texmath.js) v1.0 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT Licence</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2020 Stefan Goessner. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to the following condition: the above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. Source: github.com/goessner/markdown-it-texmath.</p>
          </div>

        </div>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 7. Disclaimer of Liability ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Disclaimer of Liability</h4>
        <p style="margin: 0 0 8px;">REVERY NOTEBOOK IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
        <p style="margin: 0 0 8px;">TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, HARALD MARK THIRSLUND SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION ANY LOSS OF DATA, LOSS OF PROFITS, OR BUSINESS INTERRUPTION, HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT, ARISING IN ANY WAY OUT OF THE USE OF OR INABILITY TO USE THIS APPLICATION.</p>
        <p style="margin: 0;"><strong>Important:</strong> Because your documents are stored solely in your browser's localStorage, data may be lost if you clear your browser data, switch browsers, use private/incognito mode, or if your browser storage quota is exceeded. <strong>Always export your work regularly.</strong></p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 8. Changes to this Notice ── -->
      <section style="margin-bottom: 4px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Changes to This Notice</h4>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund may update this legal notice from time to time. Material changes will be indicated by an updated date in the application. Continued use of Revery Notebook after any changes constitutes acceptance of the revised notice.</p>
        <p style="margin: 0; font-size: 0.82em; font-family: var(--font-mono);">Last updated: April 2026 &nbsp;·&nbsp; Harald Mark Thirslund, Göteborg, Sweden</p>
      </section>
    `,
    Swedish: `
      <!-- ── 1. Äganderätt & immateriella rättigheter ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Äganderätt &amp; immateriella rättigheter</h4>
        <p style="margin: 0 0 8px;">Revery Notebook är designad, utvecklad och drivs av <strong>Harald Mark Thirslund</strong>, Göteborg, Sverige.</p>
        <p style="margin: 0 0 8px;">Följande är Harald Mark Thirslunds exklusiva immateriella egendom och skyddas enligt tillämplig svensk, EU-rättslig och internationell upphovsrätt och varumärkesrätt:</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li>Typsnitten <strong>HaraldText</strong> och <strong>HaraldMono</strong> ("Harald Revery typsnitt").</li>
          <li>Alla logotyper, bildfiler och visuella varumärkeselement på denna webbplats.</li>
          <li>Applikationskoden som är skriven av Harald Mark Thirslund.</li>
          <li>Allt originalt skrivet innehåll publicerat på haraldrevery.com.</li>
        </ul>
        <p style="margin: 0;">Obehörig reproduktion, vidaredistribution eller kommersiell användning av dessa tillgångar är strängt förbjuden utan föregående skriftligt medgivande från Harald Mark Thirslund.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 2. Användarvillkor ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Användarvillkor</h4>
        <p style="margin: 0 0 8px;">Genom att använda Revery Notebook godkänner du dessa villkor. Om du inte godkänner dem, vänligen sluta använda tjänsten omedelbart.</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li>Revery Notebook är ett personligt produktivitetsverktyg. Du får använda det för alla lagliga ändamål.</li>
          <li>Du är ensamt ansvarig för det innehåll du skapar, lagrar eller exporterar med hjälp av denna applikation.</li>
          <li>Du får inte använda detta verktyg för att skapa, lagra eller distribuera olagligt, skadligt eller intrångsgörande innehåll.</li>
          <li>Harald Mark Thirslund förbehåller sig rätten att ändra eller avveckla tjänsten när som helst utan föregående meddelande.</li>
        </ul>
        <p style="margin: 0;">Dessa villkor regleras av svensk lag och, i tillämpliga fall, av Europeiska unionens lagstiftning.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 3. Lokal datalagring ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Lokal datalagring</h4>
        <p style="margin: 0 0 8px;">Revery Notebook lagrar data <strong>uteslutande på din egen enhet</strong> med hjälp av webbläsarens <code style="font-family: var(--font-mono); font-size: 0.85em;">localStorage</code>-API. Följande data lagras lokalt:</p>
        <ul style="margin: 0 0 8px; padding-left: 18px; display: flex; flex-direction: column; gap: 4px;">
          <li><strong>Dokumentinnehåll</strong> — markdowntexten du redigerar (nyckel: <code style="font-family: var(--font-mono); font-size: 0.85em;">revery_md_autosave</code>).</li>
          <li><strong>Editorinställningar</strong> — gränssnittsinställningar som tema, layout och teckenstorlekar (nyckel: <code style="font-family: var(--font-mono); font-size: 0.85em;">revery_md_settings</code>).</li>
        </ul>
        <p style="margin: 0 0 8px;"><strong>Ingen data skickas någonsin till någon server.</strong> Harald Mark Thirslund har inte tillgång till, och samlar inte in, något innehåll du skriver i denna editor.</p>
        <p style="margin: 0;">Du kan radera all lokalt lagrad data när som helst genom att rensa webbläsarens webbplatsdata för denna domän, eller genom att använda alternativet "Total återställning" i Fil-menyn.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 4. Cookies & spårning ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Cookies &amp; spårning</h4>
        <p style="margin: 0 0 8px;">Revery Notebook använder <strong>inte</strong> cookies, spårningspixlar, analysskript, annonsnätverk eller någon annan datainsamlingsteknik från tredje part.</p>
        <p style="margin: 0;">Ingen personlig data delas med eller säljs till någon tredje part. Ingen användarprofileringseller beteendespårning sker.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 5. Integritetspolicy ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Integritetspolicy</h4>

        <p style="margin: 0 0 6px; font-weight: 600;">EU / EES — Allmän dataskyddsförordningen (GDPR)</p>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund är personuppgiftsansvarig enligt GDPR (förordning (EU) 2016/679). Eftersom Revery Notebook inte behandlar personuppgifter på någon server och inte samlar in identifierande information uppfylls GDPR:s principer om uppgiftsminimering och ändamålsbegränsning redan av design. Den enda data som behandlas är innehåll du frivilligt skapar, vilket lagras uteslutande i din webbläsare och aldrig lämnar din enhet. Du kan utöva dina rättigheter (tillgång, radering, portabilitet, begränsning, invändning) genom att rensa din egen webbläsarlagring. För frågor, kontakta: <strong>contact@haraldrevery.com</strong>.</p>

        <p style="margin: 0 0 6px; font-weight: 600;">Nordamerika — CCPA &amp; kanadensisk integritetslagstiftning</p>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund säljer, hyr ut eller handlar inte med någon personlig information. Ingen personlig information enligt definitionen i Californias Consumer Privacy Act (CCPA/CPRA) eller Kanadas Personal Information Protection and Electronic Documents Act (PIPEDA) / Quebecs Lag 25 samlas in via denna applikation.</p>

        <p style="margin: 0 0 6px; font-weight: 600;">Australien — Privacy Act 1988 (Cth)</p>
        <p style="margin: 0;">Revery Notebook samlar inte in personlig information enligt definitionen i den australiska Privacy Act 1988 och de australiska integritetsprinciperna (APPs).</p>
        <p style="margin: 0;">Revery Notebook är inte avsett för barn under 13 år. Genom att använda tjänsten bekräftar du att du är myndig (över 18 år), eller har målsmans godkännande, för att ingå ett bindande avtal.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 6. Tredjepartsbibliotek ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Licenser för tredjepartsbibliotek</h4>
        <p style="margin: 0 0 10px;">Revery Notebook är byggt med följande bibliotek med öppen källkod, vart och ett licensierat enligt sina respektive villkor:</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it</strong> v14 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT-licens</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2014 Vitaly Puzrin, Alex Kocharin. Tillstånd beviljas härmed, utan kostnad, till varje person som erhåller en kopia av denna programvara att använda, kopiera, modifiera, slå samman, publicera, distribuera, underlicensiera och/eller sälja kopior av programvaran, förutsatt att ovanstående upphovsrättsmeddelande och detta tillståndsmeddelande ingår i alla kopior. PROGRAMVARAN TILLHANDAHÅLLS "I BEFINTLIGT SKICK", UTAN GARANTI AV NÅGOT SLAG.</p>
          </div>
          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it-footnote</strong> v4 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT-licens</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2014 Vitaly Puzrin, Alex Kocharin. Samma MIT-licensvillkor som ovan gäller.</p>
          </div>
          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>highlight.js</strong> &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">BSD 3-klausuls licens</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2006 Ivan Sagalaev. Vidaredistribution och användning i käll- och binärform, med eller utan modifiering, är tillåten förutsatt att: (1) källkodsdistributioner behåller ovanstående upphovsrättsmeddelande; (2) binära distributioner reproducerar upphovsrättsmeddelandet i dokumentationen; (3) varken upphovsrättsinnehavarens namn eller bidragsgivarnas namn används för att marknadsföra produkter utan specifikt skriftligt tillstånd. PROGRAMVARAN TILLHANDAHÅLLS "I BEFINTLIGT SKICK" UTAN GARANTIER AV NÅGOT SLAG.</p>
          </div>
          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>KaTeX</strong> &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT-licens</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2013–2020 Khan Academy och övriga bidragsgivare. Samma MIT-licensvillkor som ovan gäller.</p>
          </div>
          <div style="background: var(--bg-hover); border: 1px solid var(--border); border-radius: 4px; padding: 10px 12px;">
            <p style="margin: 0 0 4px;"><strong>markdown-it-texmath</strong> (texmath.js) v1.0 &nbsp;·&nbsp; <span style="font-family: var(--font-mono); font-size: 0.8em;">MIT-licens</span></p>
            <p style="margin: 0; font-size: 0.82em;">Copyright © 2020 Stefan Goessner. Samma MIT-licensvillkor som ovan gäller.</p>
          </div>
        </div>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 7. Ansvarsbegränsning ── -->
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Ansvarsbegränsning</h4>
        <p style="margin: 0 0 8px;">REVERY NOTEBOOK TILLHANDAHÅLLS "I BEFINTLIGT SKICK" OCH "TILLGÄNGLIGT SOM DET ÄR", UTAN GARANTI AV NÅGOT SLAG, UTTRYCKLIG ELLER UNDERFÖRSTÅDD, INKLUSIVE MEN INTE BEGRÄNSAT TILL GARANTIER OM SÄLJBARHET, LÄMPLIGHET FÖR ETT VISST ÄNDAMÅL OCH ICKE-INTRÅNG.</p>
        <p style="margin: 0 0 8px;">I DEN UTSTRÄCKNING SOM TILLÄMPLIG LAG TILLÅTER SKALL HARALD MARK THIRSLUND INTE VARA ANSVARIG FÖR INDIREKTA, OAVSIKTLIGA, SÄRSKILDA, FÖLJDRIKTIGA ELLER STRAFFBARA SKADOR, INKLUSIVE UTAN BEGRÄNSNING DATAFÖRLUST, UTEBLIVEN VINST ELLER AFFÄRSAVBROTT.</p>
        <p style="margin: 0;"><strong>Viktigt:</strong> Eftersom dina dokument lagras uteslutande i webbläsarens localStorage kan data gå förlorad om du rensar webbläsardata, byter webbläsare, använder privat/incognito-läge eller om webbläsarens lagringskvot överskrids. <strong>Exportera alltid ditt arbete regelbundet.</strong></p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border); margin: 16px 0; opacity: 0.5;">

      <!-- ── 8. Ändringar av detta meddelande ── -->
      <section style="margin-bottom: 4px;">
        <h4 style="color: var(--text); margin: 0 0 8px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Ändringar av detta meddelande</h4>
        <p style="margin: 0 0 8px;">Harald Mark Thirslund kan komma att uppdatera detta juridiska meddelande från tid till annan. Väsentliga ändringar indikeras av ett uppdaterat datum i applikationen. Fortsatt användning av Revery Notebook efter eventuella ändringar innebär att du godkänner det reviderade meddelandet.</p>
        <p style="margin: 0; font-size: 0.82em; font-family: var(--font-mono);">Senast uppdaterad: april 2026 &nbsp;·&nbsp; Harald Mark Thirslund, Göteborg, Sverige</p>
      </section>
    `
  },

  about: {
    English: `
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text-main); margin-bottom: 4px; font-size: 1rem;">½</h4>
        <p>A markdown editor with my brand aesthetics. Simple and just works. Also has some LaTeX syntax support.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 16px 0; opacity: 0.5;">
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text-main); margin-bottom: 4px; font-size: 1rem;">Version Info</h4>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li><span style="font-family: var(--font-mono);">v1.0.0 — Stable(ish)</span></li>
          <li><span style="font-family: var(--font-mono);">Build: April 2026</span></li>
        </ul>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 16px 0; opacity: 0.5;">
    `,

    Swedish: `
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text-main); margin-bottom: 4px; font-size: 1rem;">½</h4>
        <p>En markdownredigerare med min varumärkesestetik. Enkel och fungerar bara. Har också visst stöd för LaTeX-syntax.</p>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 16px 0; opacity: 0.5;">
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text-main); margin-bottom: 4px; font-size: 1rem;">Versionsinfo</h4>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li><span style="font-family: var(--font-mono);">v1.0.0 — Stabil(ish)</span></li>
          <li><span style="font-family: var(--font-mono);">Bygg: April 2026</span></li>
        </ul>
      </section>
      <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 16px 0; opacity: 0.5;">
    `
  },

  userGuide: {
    English: `
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Keyboard Shortcuts</h4>
        <table style="width:100%; border-collapse:collapse; font-family: var(--font-mono); font-size: 0.82rem;">
          <tbody>
            <tr><td style="padding:3px 0; width:52%;">Ctrl + F</td><td style="padding:3px 0;">Open Find / Replace</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + Z</td><td style="padding:3px 0;">Undo</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + Y</td><td style="padding:3px 0;">Redo</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + S</td><td style="padding:3px 0;">Export / Save file</td></tr>
            <tr><td style="padding:3px 0;">Tab (in editor)</td><td style="padding:3px 0;">Insert 4 spaces</td></tr>
          </tbody>
        </table>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Settings Tips</h4>
        <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px;">
          <li><strong>Show Preview</strong> — toggle the live rendered preview on or off. Hiding it gives you a full-width editor.</li>
          <li><strong>Show Outline</strong> — opens a heading navigator panel on the right. Click any heading to jump to it.</li>
          <li><strong>Reader Mode</strong> — hides the editor entirely for a clean, distraction-free reading view. Press Exit Reader Mode to return.</li>
          <li><strong>Mobile View</strong> — frames the preview at a phone-sized width so you can see how your content looks on small screens (don't rely on this too much...).</li>
          <li><strong>UI Size / Text Size</strong> — "UI Size" scales menu buttons; "Text Size" scales editor and preview text.</li>
          <li><strong>Calendar Format (Settings menu)</strong> — choose how dates are inserted when you use the date toolbar action.</li>
          <li><strong>Drag the divider</strong> — the vertical bar between editor and preview can be dragged left or right to resize each pane.</li>
          <li><strong>Click any preview block</strong> — jumps the editor cursor to the matching source line.</li>
          <li><strong>CPU performance delay</strong> — Higher value = Saves battery and CPU, but not that great experience. Low value = drains more CPU and battery but smoother experience.</li>
          <li><strong>Forced Prev. Synch.</strong> — "Forced Preview Synchronization" is a more reliable synchronization between the editor and preview window, but might feel a little janky. Use if you notice that what you type is not visible on the preview.</li>
        </ul>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 8px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Markdown Basics</h4>
        <table style="width:100%; border-collapse:collapse; font-family: var(--font-mono); font-size: 0.82rem;">
          <thead><tr style="color: var(--text); border-bottom: 1px solid var(--border);"><th style="text-align:left; padding:4px 0; width:52%; font-weight:600;">You type</th><th style="text-align:left; padding:4px 0; font-weight:600;">You get</th></tr></thead>
          <tbody>
            <tr><td style="padding:4px 0;"># Heading 1</td><td style="padding:4px 0;">Large heading</td></tr>
            <tr><td style="padding:4px 0;">## Heading 2</td><td style="padding:4px 0;">Medium heading</td></tr>
            <tr><td style="padding:4px 0;">**bold**</td><td style="padding:4px 0;"><strong>bold</strong></td></tr>
            <tr><td style="padding:4px 0;">*italic*</td><td style="padding:4px 0;"><em>italic</em></td></tr>
            <tr><td style="padding:4px 0;">~~strikethrough~~</td><td style="padding:4px 0;"><s>strikethrough</s></td></tr>
            <tr><td style="padding:4px 0;">\`inline code\`</td><td style="padding:4px 0;">inline code</td></tr>
            <tr><td style="padding:4px 0;">\`\`\`<br>code block<br>\`\`\`</td><td style="padding:4px 0;">Fenced code block</td></tr>
            <tr><td style="padding:4px 0;">- item</td><td style="padding:4px 0;">Bullet list item</td></tr>
            <tr><td style="padding:4px 0;">1. item</td><td style="padding:4px 0;">Numbered list item</td></tr>
            <tr><td style="padding:4px 0;">- [ ] task</td><td style="padding:4px 0;">Checkbox (unchecked)</td></tr>
            <tr><td style="padding:4px 0;">- [x] task</td><td style="padding:4px 0;">Checkbox (checked)</td></tr>
            <tr><td style="padding:4px 0;">[text](url)</td><td style="padding:4px 0;">Hyperlink</td></tr>
            <tr><td style="padding:4px 0;">![alt](image-url)</td><td style="padding:4px 0;">Inline image</td></tr>
            <tr><td style="padding:4px 0;">&gt; quote</td><td style="padding:4px 0;">Blockquote</td></tr>
            <tr><td style="padding:4px 0;">--- (own line)</td><td style="padding:4px 0;">Horizontal rule</td></tr>
            <tr><td style="padding:4px 0;">| A | B |<br>|---|---|<br>| 1 | 2 |</td><td style="padding:4px 0;">Table</td></tr>
            <tr><td style="padding:4px 0;">[^1] / [^1]: note</td><td style="padding:4px 0;">Footnote</td></tr>
          </tbody>
        </table>
        <p style="margin: 12px 0 0; font-size: 0.8rem; font-style: italic;">Tip: Use the Toolbar menu to insert most of these without typing them by hand.</p>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 8px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Latex support</h4>
        <p style="margin: 12px 0 0; font-size: 0.8rem; font-style: italic;">This editor has LaTeX support (through "KaTeX"). </p>
      </section>
    `,



    Swedish: `
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Tangentbordsgenvägar</h4>
        <table style="width:100%; border-collapse:collapse; font-family: var(--font-mono); font-size: 0.82rem;">
          <tbody>
            <tr><td style="padding:3px 0; width:52%;">Ctrl + F</td><td style="padding:3px 0;">Öppna Sök / Ersätt</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + Z</td><td style="padding:3px 0;">Ångra</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + Y</td><td style="padding:3px 0;">Gör om</td></tr>
            <tr><td style="padding:3px 0;">Ctrl + S</td><td style="padding:3px 0;">Exportera / spara fil</td></tr>
            <tr><td style="padding:3px 0;">Tab (i redigeraren)</td><td style="padding:3px 0;">Infoga 4 mellanslag</td></tr>
          </tbody>
        </table>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 20px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Inställningstips</h4>
        <ul style="margin:0; padding-left:18px; display:flex; flex-direction:column; gap:6px;">
          <li><strong>Visa förhandsgranskning</strong> — växla den levande förhandsgranskningen på eller av. Genom att dölja den får du en helbreddsredigerare.</li>
          <li><strong>Visa disposition</strong> — öppnar en navigeringspanel för rubriker till höger. Klicka på en rubrik för att hoppa till den.</li>
          <li><strong>Läsläge</strong> — döljer redigeraren helt för en ren, störningsfri läsvy. Tryck på Avsluta läsläge för att återgå.</li>
          <li><strong>Mobilvy</strong> — ramar in förhandsgranskningen i en telefonbredd så att du ser hur ditt innehåll ser ut på små skärmar (lita inte för mycket på detta...).</li>
          <li><strong>UI-storlek / textstorlek</strong> — "UI-storlek" skalar menyknappar; "Textstorlek" skalar redigerings- och förhandsgranskningstext.</li>
          <li><strong>Kalenderformat (inställningsmeny)</strong> — välj hur datum infogas när du använder datumverktyget.</li>
          <li><strong>Dra avdelaren</strong> — den vertikala stapeln mellan redigeraren och förhandsgranskningen kan dras åt vänster eller höger för att ändra storlek på varje ruta.</li>
          <li><strong>Klicka på ett förhandsgranskningsblock</strong> — hoppar redigerarens markör till motsvarande källrad.</li>
          <li><strong>CPU-prestandafördröjning</strong> — Högre värde = sparar batteri och CPU, men inte lika bra upplevelse. Lågt värde = drar mer CPU och batteri men jämnare upplevelse.</li>
          <li><strong>Tvingad förhandsgr.synk</strong> — "Tvingad förhandsgranskningssynkronisering" är en mer pålitlig synkronisering mellan redigeraren och förhandsgranskningsfönstret, men kan kännas lite ryckig. Använd om du märker att det du skriver inte syns i förhandsgranskningen.</li>
        </ul>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 8px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Markdown-grunder</h4>
        <table style="width:100%; border-collapse:collapse; font-family: var(--font-mono); font-size: 0.82rem;">
          <thead><tr style="color: var(--text); border-bottom: 1px solid var(--border);"><th style="text-align:left; padding:4px 0; width:52%; font-weight:600;">Du skriver</th><th style="text-align:left; padding:4px 0; font-weight:600;">Du får</th></tr></thead>
          <tbody>
            <tr><td style="padding:4px 0;"># Rubrik 1</td><td style="padding:4px 0;">Stor rubrik</td></tr>
            <tr><td style="padding:4px 0;">## Rubrik 2</td><td style="padding:4px 0;">Mellanrubrik</td></tr>
            <tr><td style="padding:4px 0;">**fet**</td><td style="padding:4px 0;"><strong>fet</strong></td></tr>
            <tr><td style="padding:4px 0;">*kursiv*</td><td style="padding:4px 0;"><em>kursiv</em></td></tr>
            <tr><td style="padding:4px 0;">~~genomstruken~~</td><td style="padding:4px 0;"><s>genomstruken</s></td></tr>
            <tr><td style="padding:4px 0;">\`inline-kod\`</td><td style="padding:4px 0;">inline-kod</td></tr>
            <tr><td style="padding:4px 0;">\`\`\`<br>kodblock<br>\`\`\`</td><td style="padding:4px 0;">Inhägnat kodblock</td></tr>
            <tr><td style="padding:4px 0;">- punkt</td><td style="padding:4px 0;">Punktlista</td></tr>
            <tr><td style="padding:4px 0;">1. punkt</td><td style="padding:4px 0;">Numrerad lista</td></tr>
            <tr><td style="padding:4px 0;">- [ ] uppgift</td><td style="padding:4px 0;">Kryssruta (tom)</td></tr>
            <tr><td style="padding:4px 0;">- [x] uppgift</td><td style="padding:4px 0;">Kryssruta (ifylld)</td></tr>
            <tr><td style="padding:4px 0;">[text](url)</td><td style="padding:4px 0;">Hyperlänk</td></tr>
            <tr><td style="padding:4px 0;">![alt](bild-url)</td><td style="padding:4px 0;">Inline-bild</td></tr>
            <tr><td style="padding:4px 0;">&gt; citat</td><td style="padding:4px 0;">Citatblock</td></tr>
            <tr><td style="padding:4px 0;">--- (egen rad)</td><td style="padding:4px 0;">Horisontell linje</td></tr>
            <tr><td style="padding:4px 0;">| A | B |<br>|---|---|<br>| 1 | 2 |</td><td style="padding:4px 0;">Tabell</td></tr>
            <tr><td style="padding:4px 0;">[^1] / [^1]: not</td><td style="padding:4px 0;">Fotnot</td></tr>
          </tbody>
        </table>
        <p style="margin: 12px 0 0; font-size: 0.8rem; font-style: italic;">Tips: Använd verktygsmenyn för att infoga de flesta av dessa utan att skriva dem för hand.</p>
      </section>
      <hr style="border:0; border-top:1px solid var(--border); margin:14px 0; opacity:0.5;">
      <section style="margin-bottom: 8px;">
        <h4 style="color: var(--text); margin: 0 0 10px; font-size: 0.95rem; letter-spacing: 0.06em; text-transform: uppercase;">Latex-stöd</h4>
        <p style="margin: 12px 0 0; font-size: 0.8rem; font-style: italic;">Denna redigerare har LaTeX-stöd (via "KaTeX"). </p>
      </section>
    `
  }



};

// Define the Global Translation Helper 
// Global translation helper
window.t = function(englishString) {
  const lang = window.uiLanguage || 'English';
  if (lang === 'English') return englishString;
  
  if (window.uiTranslations[englishString] && window.uiTranslations[englishString][lang]) {
    return window.uiTranslations[englishString][lang];
  }
  return englishString; // Fallback to English if translation is missing
};
