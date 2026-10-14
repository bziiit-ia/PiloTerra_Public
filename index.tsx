import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MarcheProvider } from './components/MarcheContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Le contexte de marché est monté AU-DESSUS de <App /> :
        App filtre lui-même ses données (fetchResources) et doit donc
        pouvoir appeler useMarche(). Le provider suit la session seul. */}
    <MarcheProvider>
      <App />
    </MarcheProvider>
  </React.StrictMode>
);
