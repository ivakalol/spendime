import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { queryClient } from './app/queryClient';
import { LanguageProvider } from './i18n';
import './styles.css';
createRoot(document.getElementById('root')!).render(<StrictMode><LanguageProvider><QueryClientProvider client={queryClient}><BrowserRouter><App/></BrowserRouter></QueryClientProvider></LanguageProvider></StrictMode>);
