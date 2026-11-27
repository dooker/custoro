import DOMPurify from 'dompurify';
import type { HTMLAttributes } from 'react';

interface SafeHtmlIF extends Omit<
    HTMLAttributes<HTMLDivElement>,
    'children' | 'dangerouslySetInnerHTML'
> {
    // HTML from the app's texts (help, confirmations, errors): cleaned before it is drawn
    html: string;
}

/** The one place the app draws HTML, always through DOMPurify */
const SafeHtml = ({ html, ...props }: SafeHtmlIF) => (
    // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- cleaned by DOMPurify
    <div {...props} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
);

export default SafeHtml;
