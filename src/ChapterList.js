import { secondsToString, stringToSeconds } from './utils.js';
import { addToGallery } from './ImageHandler.js';

export class ChapterList {
    constructor() {
        this.chapters = [];
        this.eventListeners = [];
        this._duration = -1;
        this.usesMs = false;
        this.addChapter('Introduction', 0);
    }

    set duration(newDuration) {
        this._duration = newDuration;
        if (newDuration != -1) {
            this.setChapters(this.chapters);
        }
    }

    get duration() {
        return this._duration;
    }

    // Method to get chapters
    getChapters() {
        return this.chapters;
    }

    // Method to set chapters
    setChapters(newChapters) {
        // Sort the chapters by their start time
        this.chapters = newChapters.sort((a, b) => a.start - b.start);
    
        // Update the end time of each chapter to match the start time of the next chapter
        for (let i = 0; i < this.chapters.length - 1; i++) {
            this.chapters[i].end = this.chapters[i + 1].start;
        }

        // Warn if chapter starts after duration
        if (this.duration != -1) {
            for (let chapter of this.chapters) {
                if (chapter.start > this.duration * 1000) {
                    chapter.warning = 'Warning: Chapter starts after the end of the file';
                }
            }
        }

        // Update the end time of the last chapter to match the duration of the video
        if (this.chapters.length > 0) {
            this.chapters[this.chapters.length - 1].end = Math.round(this.duration * 1000);
        }

        if (this.chapters[0].start != 0) {
            this.chapters[0].warning = 'Best practice: First chapter should start at 00:00';
        }

        // check if ms are used
        this.usesMs = false;
        for (let chapter of this.chapters) {
            if (chapter.start != -1 && chapter.start % 1000 != 0) {
                this.usesMs = true;
                break;
            }
        }
    
        this.triggerEventListeners();
    }    

    addChapter(title, start) {
        const newChapter = { title, start, end: undefined };
        newChapter.start = Math.round(newChapter.start);
        this.chapters.push(newChapter);
        this.setChapters(this.chapters);
    }
    
    exportAsPodlove() {
        const includeImgLinks = document.getElementById('imgLinkSwitch').checked;
        let baseURL = document.getElementById('imageURL').value;
        if (baseURL.length > 0 && !baseURL.endsWith('/')) {
            baseURL += '/';
        }

        let xmlChapters = '<psc:chapters version="1.2" xmlns:psc="http://podlove.org/simple-chapters">\n';

        this.chapters.forEach(chapter => {
            if (!chapter.error) {
                const startTime = secondsToString(chapter.start);
                const href = chapter.url ? ` href="${chapter.url}"` : '';
                let img = '';
                if (chapter.imageId != undefined && includeImgLinks) {
                    img = ` image="${baseURL}image-${chapter.imageId}.jpg"`;
                }
                let title = chapter.title;
                if (title[0] == '_') {
                    title = title.substring(1);
                }
                xmlChapters += `    <psc:chapter start="${startTime}" title="${title}"${href}${img} />\n`;
            }
        });

        xmlChapters += '</psc:chapters>';

        return xmlChapters;
    }

    async importFromPodlove(xmlString) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    
            const chapterElements = xmlDoc.querySelectorAll("psc\\:chapter");
            const newChapters = [];
    
            for (let chapterElement of chapterElements) {
                const start = stringToSeconds(chapterElement.getAttribute("start"));
                const title = chapterElement.getAttribute("title");
                const href = chapterElement.getAttribute("href");
                const image = chapterElement.getAttribute("image");
    
                const newChapter = { title, start };
                if (href) {
                    newChapter.url = href;
                }
    
                if (image) {
                    try {
                        const response = await fetch(image, { mode: 'no-cors' });
                        const blob = await response.blob();
                        const fileName = image.split('/').pop();
                        const file = new File([blob], fileName, { type: blob.type });
    
                        const imageId = await addToGallery(file);
                        newChapter.imageId = imageId;
                    } catch (error) {
                        console.error('Error fetching image:', error);
                    }
                }
    
                newChapters.push(newChapter);
            }
    
            this.setChapters(newChapters);
        } catch (error) {
            console.error('Error importing chapters from XML:', error);
        }
    }

    exportAsJSON() {
        const includeImgLinks = document.getElementById('imgLinkSwitch').checked;
        let baseURL = document.getElementById('imageURL').value;
        if (baseURL.length > 0 && !baseURL.endsWith('/')) {
            baseURL += '/';
        }

        let jsonChapters = [];

        this.chapters.forEach(chapter => {
            if (!chapter.error) {
                const chapterObject = {
                    startTime: chapter.start / 1000,
                    title: chapter.title,
                };
                if (chapter.url) {
                    chapterObject.url = chapter.url;
                }
                if (chapter.title[0] == '_') {
                    chapterObject.title = chapter.title.substring(1);
                    chapterObject.toc = false;
                }
                if (chapter.imageId != undefined && includeImgLinks) {
                    chapterObject.img = `${baseURL}image-${chapter.imageId}.jpg`;
                }
                jsonChapters.push(chapterObject);
            }
        });

        return JSON.stringify({
            version: '1.2.0',
            chapters: jsonChapters,
        }, null, 4);
    }

    async importFromJSON(jsonString) {
        try {
            const data = JSON.parse(jsonString);
    
            if (!data.chapters || !Array.isArray(data.chapters)) {
                throw new Error("Invalid JSON format for chapters.");
            }
    
            const newChapters = [];
    
            for (let chapterData of data.chapters) {
                const start = stringToSeconds(chapterData.startTime);
                const newChapter = { title: chapterData.title, start };
    
                if (chapterData.url) {
                    newChapter.url = chapterData.url;
                }
    
                if (chapterData.img) {
                    try {
                        const response = await fetch(chapterData.img, { mode: 'no-cors' });
                        const blob = await response.blob();
                        const fileName = chapterData.img.split('/').pop();
                        const file = new File([blob], fileName, { type: blob.type });
    
                        const imageId = await addToGallery(file);
                        newChapter.imageId = imageId;
                    } catch (error) {
                        console.error('Error fetching image:', error);
                    }
                }
    
                newChapters.push(newChapter);
            }
    
            this.setChapters(newChapters);
        } catch (error) {
            console.error('Error importing chapters from JSON:', error);
        }
    }

    exportAsList() {
        // for copy pasting; includes startTime and title, but not link or image
        let list = '';
        this.chapters.forEach(chapter => {
            if (!chapter.error) {
                const startTime = secondsToString(chapter.start);
                list += `${startTime} ${chapter.title}\n`;
            }
        });
        return list;
    }

    // Method to add an event listener
    addEventListener(listener) {
        this.eventListeners.push(listener);
    }

    // Method to trigger event listeners
    triggerEventListeners() {
        this.eventListeners.forEach(listener => listener(this.chapters));
    }
}