'use client';

import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { PDFDocument, degrees } from "pdf-lib";
import * as pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/build/pdf.worker.entry';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  Container,
  Typography,
  Box,
  Button,
  Paper,
  Grid,
  IconButton,
  CircularProgress,
  Alert,
  Modal,
  Stack,
} from "@mui/material";
import {
  Delete as DeleteIcon,
  UploadFile as UploadFileIcon,
  Save as SaveIcon,
  RestartAlt as RestartAltIcon,
  ContentCut as ContentCutIcon,
  Rotate90DegreesCw as Rotate90DegreesCwIcon,
  ContentCopy as DuplicateIcon,
  ZoomIn as PreviewIcon,
  ArrowBackIosNew as ArrowBackIosNewIcon,
  ArrowForwardIos as ArrowForwardIosIcon,
} from "@mui/icons-material";

// Interface for our page objects
interface Page {
  id: string;
  originalIndex: number;
  dataUrl: string;
  rotation: number; // Added rotation property
}

const modalStyle = {
  position: 'absolute' as 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 2,
  maxWidth: '90vw',
  maxHeight: '90vh',
};

// Component for a single sortable page thumbnail
const SortablePage = ({ page, onRotate, onDuplicate, onPreview, onDelete }: { 
  page: Page;
  onRotate: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPreview: (page: Page) => void; // Changed to pass full page object
  onDelete: (id: string) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
    borderRadius: '4px',
    position: "relative" as const,
    overflow: 'hidden',
  };

  const handleButtonPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <Paper ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <img src={page.dataUrl} alt={`Page ${page.originalIndex + 1}`} style={{ width: "100%", display: "block", transform: `rotate(${page.rotation}deg)` }} />
      
      <Box sx={{ position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '15px', p: '1px' }}>
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" sx={{ color: 'white' }} onPointerDown={handleButtonPointerDown} onClick={() => { onPreview(page); }}><PreviewIcon fontSize="small" /></IconButton>
          <IconButton size="small" sx={{ color: 'white' }} onPointerDown={handleButtonPointerDown} onClick={() => { onRotate(page.id); }}><Rotate90DegreesCwIcon fontSize="small" /></IconButton>
          <IconButton size="small" sx={{ color: 'white' }} onPointerDown={handleButtonPointerDown} onClick={() => { onDuplicate(page.id); }}><DuplicateIcon fontSize="small" /></IconButton>
          <IconButton size="small" sx={{ color: 'white' }} onPointerDown={handleButtonPointerDown} onClick={() => { onDelete(page.id); }}><DeleteIcon fontSize="small" /></IconButton>
        </Stack>
      </Box>

      <Typography variant="caption" display="block" textAlign="center" sx={{ mt: 0.5, fontWeight: 'medium' }}>
        Trang {page.originalIndex + 1}
      </Typography>
    </Paper>
  );
};

export default function PdfEditor() {
  const [pages, setPages] = useState<Page[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfName, setPdfName] = useState("edited.pdf");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewingPageDataUrl, setPreviewingPageDataUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState(false);
  const [previewPageIndex, setPreviewPageIndex] = useState<number | null>(null); // New state for current page in preview

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      setPdfName(file.name.replace(/\.pdf$/i, "_edited.pdf"));

      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      setPdfBytes(bytes);

      const pdfjsDoc = await pdfjs.getDocument({ data: bytes.slice() }).promise; // Use a slice to prevent mutation
      const renderedPages: Page[] = [];

      for (let i = 0; i < pdfjsDoc.numPages; i++) {
        const page = await pdfjsDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          renderedPages.push({
            id: `page-${i}`,
            originalIndex: i,
            dataUrl: canvas.toDataURL(),
            rotation: 0,
          });
        }
      }
      setPages(renderedPages);
    } catch (e) {
      console.error("Error processing PDF:", e);
      setError("Could not process the PDF file. It may be corrupt or protected.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { "application/pdf": [".pdf"] }, multiple: false });

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleDeletePage = (id: string) => setPages((p) => p.filter((page) => page.id !== id));
  
  const renderPreviewPage = useCallback(async (pageToPreview: Page) => {
    if (!pdfBytes) {
      setError("Original PDF data not found for preview.");
      return null;
    }
    setIsRenderingPreview(true);
    setError(null);

    try {
      const pdfjsDoc = await pdfjs.getDocument({ data: pdfBytes.slice() }).promise;
      const page = await pdfjsDoc.getPage(pageToPreview.originalIndex + 1);
      
      // Render at a higher scale for preview, and apply rotation
      const viewport = page.getViewport({ scale: 3.0, rotation: pageToPreview.rotation }); 
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        return canvas.toDataURL();
      }
      return null;
    } catch (e) {
      console.error("Error rendering preview:", e);
      setError("Failed to render page preview.");
      return null;
    } finally {
      setIsRenderingPreview(false);
    }
  }, [pdfBytes]); // Dependency on pdfBytes

  const handlePreviewPage = useCallback((pageToPreview: Page) => {
    const index = pages.findIndex(p => p.id === pageToPreview.id);
    if (index !== -1) {
      setPreviewPageIndex(index);
    }
  }, [pages]);

  useEffect(() => {
    const updatePreview = async () => {
      if (previewPageIndex !== null && pages[previewPageIndex]) {
        const dataUrl = await renderPreviewPage(pages[previewPageIndex]);
        setPreviewingPageDataUrl(dataUrl);
      } else {
        setPreviewingPageDataUrl(null);
      }
    };
    updatePreview();
  }, [previewPageIndex, pages, renderPreviewPage]); // Dependencies on previewPageIndex, pages, and renderPreviewPage

  const handleClosePreview = () => {
    setPreviewingPageDataUrl(null);
    setPreviewPageIndex(null);
  };

  const handlePreviousPageInPreview = () => {
    setPreviewPageIndex(prevIndex => (prevIndex !== null && prevIndex > 0) ? prevIndex - 1 : prevIndex);
  };

  const handleNextPageInPreview = () => {
    setPreviewPageIndex(prevIndex => (prevIndex !== null && prevIndex < pages.length - 1) ? prevIndex + 1 : prevIndex);
  };

  const handleRotatePageInPreview = () => {
    if (previewPageIndex !== null) {
      const currentPageId = pages[previewPageIndex].id;
      setPages(currentPages => 
        currentPages.map(p => 
          p.id === currentPageId ? { ...p, rotation: (p.rotation + 90) % 360 } : p
        )
      );
    }
  };

  const handleDeletePageInPreview = () => {
    if (previewPageIndex !== null) {
      const pageIdToDelete = pages[previewPageIndex].id;
      setPages(currentPages => currentPages.filter(p => p.id !== pageIdToDelete));
      // Adjust preview index if the deleted page was the last one
      if (pages.length === 1) { // If it was the only page
        handleClosePreview();
      } else if (previewPageIndex === pages.length - 1) { // If it was the last page
        setPreviewPageIndex(prevIndex => (prevIndex !== null && prevIndex > 0) ? prevIndex - 1 : 0);
      }
    }
  };

  const handleRotatePage = (id: string) => {
    setPages(currentPages => 
      currentPages.map(p => 
        p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p
      )
    );
  };

  const handleDuplicatePage = (id: string) => {
    setPages(currentPages => {
      const pageIndex = currentPages.findIndex(p => p.id === id);
      if (pageIndex === -1) return currentPages;

      const pageToDuplicate = currentPages[pageIndex];
      const newPage = {
        ...pageToDuplicate,
        id: `${pageToDuplicate.id}-copy-${Date.now()}`,
      };

      const newPages = [...currentPages];
      newPages.splice(pageIndex + 1, 0, newPage);
      return newPages;
    });
  };

  const handleSaveChanges = async () => {
    if (!pdfBytes || pages.length === 0) return;
    
    setIsLoading(true);
    try {
      const originalPdfDoc = await PDFDocument.load(pdfBytes.slice());
      const newPdfDoc = await PDFDocument.create();

      for (const page of pages) {
        const [copiedPage] = await newPdfDoc.copyPages(originalPdfDoc, [page.originalIndex]);
        copiedPage.setRotation(degrees(page.rotation));
        newPdfDoc.addPage(copiedPage);
      }

      const newPdfBytes = await newPdfDoc.save();
      
      const blob = new Blob([newPdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = pdfName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Error saving PDF:", e);
      setError("Failed to save the new PDF.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <Paper elevation={0} sx={{ backgroundColor: 'transparent', p: 4, borderRadius: 2 }}>
        <Typography variant="h3" component="h1" gutterBottom textAlign="center" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
          Trình Chỉnh Sửa PDF
        </Typography>
        <Typography variant="h6" textAlign="center" color="text.secondary" sx={{ mb: 4, fontWeight: 'normal' }}>
          Kéo thả file, sắp xếp, xoá trang và lưu lại file PDF mới của bạn một cách dễ dàng.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {pages.length === 0 && !isLoading && (
          <Box {...getRootProps()} sx={{ border: "3px dashed", borderColor: isDragActive ? "primary.main" : "grey.400", borderRadius: 2, p: 6, textAlign: "center", cursor: "pointer", backgroundColor: isDragActive ? "primary.light" : "grey.100", transition: "all 0.2s ease-in-out", color: 'grey.600', "&:hover": { borderColor: 'primary.dark', backgroundColor: 'primary.light', color: 'primary.dark'} }}>
            <input {...getInputProps()} />
            <UploadFileIcon sx={{ fontSize: 60, mb: 2, opacity: 0.7 }} />
            <Typography variant="h5">Kéo và thả file PDF vào đây</Typography>
            <Typography>hoặc nhấn để chọn file</Typography>
          </Box>
        )}

        {isLoading && (
          <Box sx={{ display: "flex", justifyContent: "center", my: 4 }}>
            <CircularProgress />
            <Typography variant="h6" sx={{ ml: 2 }}>Đang xử lý file...</Typography>
          </Box>
        )}

        {pages.length > 0 && !isLoading && (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pages} strategy={rectSortingStrategy}>
                <Grid container spacing={4} sx={{ mt: 2 }}>
                  {pages.map((page, index) => (
                    <Grid item xs={6} sm={4} md={3} lg={2} key={page.id}>
                      <Box sx={{ position: 'relative' }}>
                        <SortablePage page={page} onDelete={handleDeletePage} onRotate={handleRotatePage} onDuplicate={handleDuplicatePage} onPreview={handlePreviewPage} />
                        {index < pages.length - 1 && (
                          <Box sx={{ position: 'absolute', top: 0, right: -16, height: '100%', display: 'flex', alignItems: 'center', zIndex: 10 }}>
                            <Box sx={{ height: '80%', borderRight: '2px dashed', borderColor: 'grey.400' }} />
                            <ContentCutIcon sx={{ color: 'grey.500', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%) rotate(90deg)', backgroundColor: 'grey.50', p: 0.5, borderRadius: '50%' }} />
                          </Box>
                        )}
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </SortableContext>
            </DndContext>

            <Box sx={{ display: "flex", justifyContent: "center", gap: 2, mt: 6 }}>
              <Button variant="contained" color="primary" onClick={handleSaveChanges} disabled={pages.length === 0} startIcon={<SaveIcon />}>
                Lưu Thay Đổi
              </Button>
              <Button variant="outlined" color="secondary" onClick={() => { setPages([]); setPdfBytes(null); setError(null); }} startIcon={<RestartAltIcon />}>
                Làm Lại
              </Button>
            </Box>
          </>
        )}
      </Paper>
      <Modal open={previewPageIndex !== null} onClose={handleClosePreview} aria-labelledby="preview-title">
        <Box sx={modalStyle}>
          {isRenderingPreview ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {previewingPageDataUrl && (
                <img src={previewingPageDataUrl} alt={`Page Preview ${previewPageIndex !== null ? previewPageIndex + 1 : ''}`} style={{ maxWidth: '100%', maxHeight: 'calc(90vh - 48px)' }} />
              )}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
                <IconButton onClick={handlePreviousPageInPreview} disabled={previewPageIndex === 0 || previewPageIndex === null}>
                  <ArrowBackIosNewIcon />
                </IconButton>
                <Typography variant="body1" sx={{ alignSelf: 'center' }}>
                  Trang {previewPageIndex !== null ? previewPageIndex + 1 : '-'} / {pages.length}
                </Typography>
                <IconButton onClick={handleNextPageInPreview} disabled={previewPageIndex === pages.length - 1 || previewPageIndex === null}>
                  <ArrowForwardIosIcon />
                </IconButton>
                <IconButton onClick={handleRotatePageInPreview}>
                  <Rotate90DegreesCwIcon />
                </IconButton>
                <IconButton onClick={handleDeletePageInPreview}>
                  <DeleteIcon />
                </IconButton>
                <Button onClick={handleClosePreview} sx={{ ml: 2 }}>Đóng</Button>
              </Box>
            </>
          )}
        </Box>
      </Modal>
    </Container>
  );
}
