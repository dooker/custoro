/* eslint-env node */
/** @type {import('tailwindcss').Config} */

module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                white: '#ffffff',
                black: '#000000',
                logo: 'rgba(255, 255, 255, 0.8)',
                turquoise: '#1abc9c',
                greenSea: '#16a085',
                sunFlower: '#f1c40f',
                orange: '#f39c12',
                emerald: '#2ecc71',
                nephritis: '#27ae60',
                carrot: '#e67e22',
                pumpkin: '#d35400',
                peterRiver: '#3498db',
                belizeHole: '#2980b9',
                alizarin: '#e74c3c',
                pomegranate: '#c0392b',
                amethyst: '#9b59b6',
                wisteria: '#8e44ad',
                clouds: '#ecf0f1',
                silver: '#bdc3c7',
                wetAsphalt: '#34495e',
                midnightBlue: '#2c3e50',
                concrete: '#95a5a6',
                asbestos: '#7f8c8d',
                hover: 'rgba(26, 188, 156, 0.03)',
                liHover: '#f7f7f7',
            },
            spacing: {
                8: '8px',
                10: '10px',
                12: '12px',
                16: '16px',
                24: '24px',
            },
        },
    },
    plugins: [],
}
