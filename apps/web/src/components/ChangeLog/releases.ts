export interface Release {
    // "5.0.0", "Unreleased", "Pre-monorepo history"
    version: string;
    // "2026-11-14" when the heading has one
    date?: string;
    // The release's Markdown without its heading: ### sections and their lists
    body: string;
}

export interface ChangeLogParts {
    // The text before the first release
    intro: string;
    releases: Release[];
}

// CHANGELOG.md as "# title, intro, then one ## heading per release". A release without any entries
// (Unreleased right after a release) is left out, since the page would show an empty heading.
export const splitChangeLog = (markdown: string): ChangeLogParts => {
    const text = markdown.replace(/\r\n/g, '\n').replace(/^# .*\n/, '');
    const [intro, ...parts] = text.split(/^## /m);

    const releases = parts
        .map((part) => {
            const newline = part.indexOf('\n');
            const heading = (newline === -1 ? part : part.slice(0, newline)).trim();
            const body = newline === -1 ? '' : part.slice(newline + 1).trim();
            const dated = /^(.+?)\s+-\s+(\d{4}-\d{2}-\d{2})$/.exec(heading);
            return dated ? { version: dated[1], date: dated[2], body } : { version: heading, body };
        })
        .filter((release) => release.body !== '');

    return { intro: intro.trim(), releases };
};

// The longest lead that is set in bold; a longer first sentence is left as it is
const maxLead = 140;

// An entry's lead in bold, so the page can be scanned: the text up to its first ": " or ". ",
// when that is short and not inside `code` ("`Cache-Control: no-store`" is not a lead).
export const boldLead = (entry: string) => {
    const text = entry.replace(/^- /, '');
    if (text.startsWith('**')) {
        return entry;
    }
    const lead = /[:.](?= )/g;
    for (let match = lead.exec(text); match && match.index < maxLead; match = lead.exec(text)) {
        const end = match.index + 1;
        if ((text.slice(0, end).match(/`/g) ?? []).length % 2 === 0) {
            return `- **${text.slice(0, end)}**${text.slice(end)}`;
        }
    }
    return entry;
};

// boldLead for every top-level entry of a release's Markdown
export const boldLeads = (body: string) =>
    body
        .split('\n')
        .map((line) => (line.startsWith('- ') ? boldLead(line) : line))
        .join('\n');

// The kind of a ### section, for its colour; anything else is shown plain
export const sectionKind = (title: string) => {
    const kind = title.trim().toLowerCase();
    return ['added', 'security', 'fixed', 'changed'].includes(kind) ? kind : 'other';
};
