'use client';

import dynamic from 'next/dynamic';

const PdfEditor = dynamic(() => import('../components/PdfEditor'), { 
  ssr: false, 
  loading: () => <p>Loading editor...</p> // Optional: add a loading indicator
});

export default function Home() {
  return (
    <main>
      <PdfEditor />
    </main>
  );
}