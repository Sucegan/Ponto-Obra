import './globals.css';

export const metadata = {
    title: 'ObraPonto PRO | Gestão de diárias',
    description: 'Controle de ponto, diárias e pagamentos para equipes de obra.'
};

export default function RootLayout({ children }) {
    return <html lang="pt-BR"><body>{children}</body></html>;
}