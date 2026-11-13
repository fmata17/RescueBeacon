import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
// jsdom omits this browser SVG capability probe used by Leaflet's route renderer.
Object.defineProperty(SVGSVGElement.prototype, 'createSVGRect', { value: () => ({}) });
afterEach(cleanup);
