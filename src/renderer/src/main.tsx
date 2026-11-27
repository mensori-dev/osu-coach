import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/unbounded/600.css';
import '@fontsource/unbounded/700.css';
import App from './App';
import { OverlayView } from './components/OverlayView';
import './styles.css';

const isOverlay = window.location.hash === '#overlay';
if (isOverlay) document.body.classList.add('overlay-body');

createRoot(document.getElementById('root')!).render(<StrictMode>{isOverlay ? <OverlayView /> : <App />}</StrictMode>);
