import { Placeholder } from './Placeholder.js';

// These fields identify the service applying the PDF signature. The certificate
// subject is configured separately in the PFX used to sign the document.
export default function addSignaturePlaceholder(pdfDoc, signedFor) {
  const name = process.env.PDF_SIGNER_NAME?.trim() || 'OpenSign';
  const contactInfo = process.env.PDF_SIGNER_CONTACT?.trim() || 'hello@opensignlabs.com';

  Placeholder({
    pdfDoc,
    reason:
      signedFor === undefined
        ? `Digitally signed by ${name}.`
        : `Digitally signed by ${name} for ${signedFor}`,
    location: 'n/a',
    name,
    contactInfo,
    signatureLength: 16000,
  });
}
