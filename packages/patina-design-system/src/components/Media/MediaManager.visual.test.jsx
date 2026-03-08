"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const react_1 = require("@testing-library/react");
const react_2 = require("@storybook/react");
const stories = __importStar(require("./MediaManager.stories"));
const { DefaultManager, GalleryOverview, FileUploader } = (0, react_2.composeStories)(stories);
(0, vitest_1.describe)('Media components visual regression', () => {
    (0, vitest_1.it)('renders the media manager toolbar and search affordances', () => {
        const { container } = (0, react_1.render)(<DefaultManager />);
        (0, vitest_1.expect)(react_1.screen.getByText('Media Library')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByPlaceholderText('Search assets...')).toBeInTheDocument();
        (0, vitest_1.expect)(container.querySelectorAll('button').length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('renders gallery asset cards with titles', () => {
        (0, react_1.render)(<GalleryOverview />);
        (0, vitest_1.expect)(react_1.screen.getByText('Living Room Hero.jpg')).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Modular Sofa Render.glb')).toBeInTheDocument();
    });
    (0, vitest_1.it)('displays uploader dropzone guidance', () => {
        (0, react_1.render)(<FileUploader />);
        (0, vitest_1.expect)(react_1.screen.getByText(/Drag & drop files here/i)).toBeInTheDocument();
        (0, vitest_1.expect)(react_1.screen.getByText('Supports images, videos, 3D models, and documents')).toBeInTheDocument();
    });
});
//# sourceMappingURL=MediaManager.visual.test.jsx.map