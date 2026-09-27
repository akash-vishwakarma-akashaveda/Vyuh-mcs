import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/global.css';
import { initTheme } from '../lib/theme';
import { SimLab } from './SimLab';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SimLab />
  </React.StrictMode>
);
