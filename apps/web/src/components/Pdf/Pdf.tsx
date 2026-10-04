import { RESOURCE } from '../../variables';
import Loader from '../_shared/Loader/Loader';
import BiggerError from '../BiggerError/BiggerError';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { getSingle } from '../../utils/Getters/getSingle';
import { type AxiosResponse } from 'axios';
import style from './Pdf.module.sass';

type PdfResponse = AxiosResponse<ArrayBuffer>;

interface PdfDocument {
    url: string;
    filename: string;
}

const Pdf = () => {
    const { hash } = useParams();
    const applicationPdf = 'application/pdf';

    // fetch pdf
    const {
        data: pdfData,
        isLoading,
        isError,
    } = useQuery<PdfResponse | null, Error, PdfDocument | null>({
        queryKey: [RESOURCE.PDF],
        queryFn: () =>
            getSingle({
                id: hash,
                type: RESOURCE.PDF,
                config: {
                    responseType: 'arraybuffer',
                    headers: { Accept: applicationPdf },
                },
            }),
        enabled: !!hash,
        select: (response) => {
            if (!response) return null;

            const blob = new Blob([response.data], { type: applicationPdf });
            const match = response.headers['content-disposition']?.match(/filename="(.+?)"/);

            return {
                url: URL.createObjectURL(blob),
                filename: match ? match[1] : 'document.pdf',
            };
        },
    });

    if (isLoading) return <Loader />;
    if (isError || !pdfData) return <BiggerError type="pdf" />;

    return (
        <>
            <iframe title="Invoice Viewer" src={pdfData.url} className={style.pdfIframe}></iframe>
            <a href={pdfData.url} download={pdfData.filename} className={style.download}>
                &nbsp;
            </a>
        </>
    );
};

export default Pdf;
