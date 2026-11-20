import type { Apartment } from './hossa.ts';

/** Telegram rejects longer messages. */
export const MAX_MESSAGE_LENGTH = 4096;

const area = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const price = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

export function formatApartment(a: Apartment): string {
  const parts = [a.number];
  if (a.building) parts.push(`bud. ${a.building}`);
  if (a.floor !== null) parts.push(a.floor === 0 ? 'parter' : `piętro ${a.floor}`);
  if (a.rooms !== null) parts.push(`${a.rooms} pok.`);
  if (a.areaUsable !== null) parts.push(`${area.format(a.areaUsable)} m²`);
  if (a.price !== null) parts.push(`${price.format(a.price)} zł`);
  if (a.availability) parts.push(`odbiór ${a.availability}`);
  return parts.join(' · ');
}

interface Section {
  title: string;
  lines: string[];
}

/** Joins the sections, cutting the longest lists until the text fits in one Telegram message. */
function render(header: string, sections: Section[], footer: string): string {
  const shown = sections.map((s) => s.lines.length);
  const build = () =>
    [
      header,
      ...sections.map((s, i) => {
        const hidden = s.lines.length - shown[i]!;
        const lines = s.lines.slice(0, shown[i]);
        if (hidden > 0) lines.push(`…i ${hidden} więcej`);
        return `${s.title}\n${lines.join('\n')}`;
      }),
      footer,
    ].join('\n\n');

  let text = build();
  while (text.length > MAX_MESSAGE_LENGTH) {
    const longest = shown.indexOf(Math.max(...shown));
    if (shown[longest]! === 0) return text.slice(0, MAX_MESSAGE_LENGTH);
    shown[longest]!--;
    text = build();
  }
  return text;
}

export function buildInitialMessage(apartments: Apartment[], searchUrl: string): string {
  const header = '🏠 Hossa: monitorowanie wyszukiwania uruchomione';
  if (apartments.length === 0) {
    return `${header}\n\nNa razie nic nie pasuje do wyszukiwania. Dam znać, gdy pojawi się nowe mieszkanie.\n\n${searchUrl}`;
  }
  return render(
    header,
    [{ title: `Pasujące mieszkania (${apartments.length}):`, lines: apartments.map(formatApartment) }],
    `Dam znać, gdy pojawi się nowe albo któreś zniknie.\n${searchUrl}`,
  );
}

export function buildChangeMessage(added: Apartment[], removed: Apartment[], searchUrl: string): string {
  const sections: Section[] = [];
  if (added.length > 0) sections.push({ title: `🆕 Nowe w wynikach (${added.length}):`, lines: added.map(formatApartment) });
  if (removed.length > 0) {
    sections.push({ title: `❌ Zniknęły z wyników (${removed.length}):`, lines: removed.map(formatApartment) });
  }
  return render('🏠 Hossa: zmiany w wynikach wyszukiwania', sections, searchUrl);
}
