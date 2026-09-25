/* ==========================================
   AETHER BI - CHART CONFIGURATION & RENDERING
   ========================================== */

// Color Palettes for Premium Aesthetics
const COLOR_PALETTES = {
    cosmic: {
        backgrounds: [
            'rgba(0, 242, 254, 0.75)',  // Neon Cyan
            'rgba(155, 81, 224, 0.75)',  // Royal Purple
            'rgba(255, 0, 127, 0.75)',   // Hot Pink
            'rgba(0, 122, 255, 0.75)',   // Electric Blue
            'rgba(242, 201, 76, 0.75)',  // Golden Amber
            'rgba(39, 174, 96, 0.75)'    // Emerald
        ],
        borders: [
            '#00f2fe', '#9b51e0', '#ff007f', '#007aff', '#f2c94c', '#27ae60'
        ]
    },
    sunset: {
        backgrounds: [
            'rgba(255, 107, 107, 0.75)', // Sunset Red
            'rgba(255, 159, 67, 0.75)',  // Orange
            'rgba(255, 205, 86, 0.75)',  // Warm Yellow
            'rgba(243, 104, 224, 0.75)', // Soft Magenta
            'rgba(255, 190, 118, 0.75)', // Peach
            'rgba(235, 77, 75, 0.75)'    // Coral
        ],
        borders: [
            '#ff6b6b', '#ff9f43', '#ffcd56', '#f368e0', '#ffbe76', '#eb4d4b'
        ]
    },
    emerald: {
        backgrounds: [
            'rgba(46, 204, 113, 0.75)',  // Mint Green
            'rgba(26, 188, 156, 0.75)',  // Teal
            'rgba(39, 174, 96, 0.75)',   // Emerald
            'rgba(72, 219, 251, 0.75)',  // Ice Blue
            'rgba(29, 209, 161, 0.75)',  // Soft Teal
            'rgba(168, 230, 207, 0.75)'  // Pale Sage
        ],
        borders: [
            '#2ece71', '#1abc9c', '#27ae60', '#48dbfb', '#1dd1a1', '#a8e6cf'
        ]
    },
    cyber: {
        backgrounds: [
            'rgba(254, 242, 0, 0.75)',   // Cyber Yellow
            'rgba(0, 242, 254, 0.75)',   // Neon Cyan
            'rgba(255, 0, 127, 0.75)',   // Cyber Pink
            'rgba(186, 220, 88, 0.75)',  // Lime
            'rgba(224, 86, 253, 0.75)',  // Violet
            'rgba(104, 109, 224, 0.75)'  // Steel Blue
        ],
        borders: [
            '#fef200', '#00f2fe', '#ff007f', '#badc58', '#e056fd', '#686de0'
        ]
    },
    classic: {
        backgrounds: [
            'rgba(41, 128, 185, 0.75)',  // Classic Blue
            'rgba(52, 152, 219, 0.75)',  // Light Blue
            'rgba(26, 188, 156, 0.75)',  // Teal
            'rgba(52, 73, 94, 0.75)',    // Slate
            'rgba(142, 68, 173, 0.75)',  // Purple
            'rgba(127, 140, 141, 0.75)'  // Gray
        ],
        borders: [
            '#2980b9', '#3498db', '#1abc9c', '#34495e', '#8e44ad', '#7f8c8d'
        ]
    }
};

// State to keep track of active Chart instances (to destroy/recreate them)
const activeChartInstances = {};

/**
 * Read current theme colors from CSS custom properties for chart rendering.
 */
function getThemeColors() {
    const styles = getComputedStyle(document.body);
    const textSecondary = styles.getPropertyValue('--text-secondary').trim() || '#a3a8c3';
    const textPrimary = styles.getPropertyValue('--text-primary').trim() || '#f1f3fa';
    const primary = styles.getPropertyValue('--primary').trim() || '#00f2fe';
    const cardBg = styles.getPropertyValue('--card-bg').trim() || 'rgba(19, 23, 48, 0.95)';
    const bgDark = styles.getPropertyValue('--bg-dark').trim() || '#070913';

    // Detect light theme
    const isLight = bgDark.startsWith('#f') || bgDark.startsWith('#e') || bgDark.startsWith('rgb(2');

    return {
        textColor: textSecondary,
        titleColor: textPrimary,
        primary: primary,
        gridColor: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)',
        tooltipBg: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(19, 23, 48, 0.95)',
        tooltipTitle: primary,
        tooltipBody: textPrimary,
        tooltipBorder: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
        dataLabelColor: isLight ? '#333' : '#fff',
        isLight: isLight
    };
}

/**
 * Returns colors matching a palette, repeating colors if data count exceeds palette size.
 */
function getPaletteColors(paletteName, count) {
    const palette = COLOR_PALETTES[paletteName] || COLOR_PALETTES.cosmic;
    const bgList = [];
    const borderList = [];
    
    for (let i = 0; i < count; i++) {
        bgList.push(palette.backgrounds[i % palette.backgrounds.length]);
        borderList.push(palette.borders[i % palette.borders.length]);
    }
    
    return { backgrounds: bgList, borders: borderList };
}

/**
 * Destroys existing chart on a canvas if it exists.
 */
function destroyChartInstance(canvasId) {
    if (activeChartInstances[canvasId]) {
        try {
            if (typeof activeChartInstances[canvasId].destroy === 'function') {
                activeChartInstances[canvasId].destroy();
            }
        } catch (e) {}
        delete activeChartInstances[canvasId];
    }
    const canvas = document.getElementById(canvasId);
    if (canvas && canvas.tagName === 'CANVAS') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
    const parent = canvas ? canvas.parentElement : null;
    if (parent) {
        parent.querySelectorAll('.dom-matrix-table, .dom-multicard-grid').forEach(el => el.remove());
    }
}

// Custom Chart.js plugin for data labels
const dataLabelsPlugin = {
    id: 'aetherDataLabels',
    afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions || !pluginOptions.enabled) return;

        const { ctx } = chart;
        const theme = getThemeColors();

        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return;

            meta.data.forEach((element, index) => {
                const value = dataset.data[index];
                if (value === null || value === undefined) return;

                let displayVal;
                if (typeof value === 'object' && value.y !== undefined) {
                    displayVal = value.y;
                } else {
                    displayVal = value;
                }

                if (typeof displayVal === 'number') {
                    if (Math.abs(displayVal) >= 1e6) {
                        displayVal = (displayVal / 1e6).toFixed(1) + 'M';
                    } else if (Math.abs(displayVal) >= 1e3) {
                        displayVal = (displayVal / 1e3).toFixed(1) + 'K';
                    } else {
                        displayVal = displayVal % 1 === 0 ? displayVal : displayVal.toFixed(1);
                    }
                }

                ctx.save();
                ctx.font = '600 10px Inter';
                ctx.fillStyle = theme.dataLabelColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const chartType = meta.type;
                let x = element.x;
                let y = element.y;

                if (chartType === 'bar') {
                    if (chart.options.indexAxis === 'y') {
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(displayVal, x + 6, y);
                    } else {
                        ctx.fillText(displayVal, x, y - 5);
                    }
                } else if (['pie', 'doughnut', 'polarArea'].includes(chartType)) {
                    const arc = element;
                    const midAngle = (arc.startAngle + arc.endAngle) / 2;
                    const radius = (arc.innerRadius + arc.outerRadius) / 2;
                    const labelX = arc.x + Math.cos(midAngle) * radius;
                    const labelY = arc.y + Math.sin(midAngle) * radius;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#fff';
                    ctx.font = '700 11px Inter';
                    ctx.fillText(displayVal, labelX, labelY);
                } else {
                    ctx.fillText(displayVal, x, y - 8);
                }

                ctx.restore();
            });
        });
    }
};

// Register the plugin globally
Chart.register(dataLabelsPlugin);

/**
 * Renders a chart on a canvas using the given options.
 */
function buildChart(canvasId, type, labels, datasets, showGrid = true, customOptions = {}) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;
    
    // Destroy previous chart
    destroyChartInstance(canvasId);
    
    const theme = getThemeColors();
    const gridColor = theme.gridColor;
    const textColor = theme.textColor;
    const titleColor = theme.titleColor;
    
    // Determine base Chart.js chart type
    let chartJsType = type;
    if (['stackedBar', 'horizontalBar', 'stackedHorizontalBar', 'percentStackedColumn', 'percentStackedBar', 'lineClusteredColumn', 'lineStackedColumn', 'histogram'].includes(type)) {
        chartJsType = 'bar';
    } else if (type === 'area' || type === 'stackedArea' || type === 'stepLine') {
        chartJsType = 'line';
    } else if (type === 'scatter') {
        chartJsType = 'scatter';
    }

    // Specialized Power BI Visual Archetype Renderers
    if (type === 'heatmap') {
        return renderHeatmapCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'boxPlot') {
        return renderBoxPlotCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'funnel') {
        return renderFunnelCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'waterfall') {
        return renderWaterfallCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'treemap') {
        return renderTreemapCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'gauge') {
        return renderGaugeCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'bullet') {
        return renderBulletCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'gantt') {
        return renderGanttCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'geoMap') {
        return renderGeoMapCanvas(canvasId, labels, datasets, customOptions);
    } else if (type === 'tableMatrix') {
        return renderTableMatrixDOM(canvasId, labels, datasets, customOptions);
    } else if (type === 'multiCard') {
        return renderMultiCardDOM(canvasId, labels, datasets, customOptions);
    } else if (type === 'ribbon') {
        return renderRibbonCanvas(canvasId, labels, datasets, customOptions);
    }

    // Chart.js specific configuration
    const config = {
        type: chartJsType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: !!customOptions.title,
                    text: customOptions.title || '',
                    color: titleColor,
                    font: {
                        family: 'Outfit',
                        size: 16,
                        weight: '600'
                    },
                    padding: { top: 10, bottom: 20 }
                },
                legend: {
                    display: customOptions.showLegend !== false,
                    position: customOptions.legendPosition || 'top',
                    labels: {
                        color: textColor,
                        font: { family: 'Inter', size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: theme.tooltipBg,
                    titleColor: theme.tooltipTitle,
                    bodyColor: theme.tooltipBody,
                    borderColor: theme.tooltipBorder,
                    borderWidth: 1,
                    padding: 12,
                    bodyFont: { family: 'Inter' },
                    titleFont: { family: 'Outfit', weight: 'bold' }
                },
                aetherDataLabels: {
                    enabled: !!customOptions.showDataLabels
                }
            },
            scales: {}
        }
    };
    
    // Add grid options for Cartesian charts (Bar, Line, Scatter, Bubble)
    const isCartesian = ['bar', 'line', 'scatter', 'bubble'].includes(config.type);
    if (isCartesian) {
        config.options.scales = {
            x: {
                grid: {
                    display: showGrid,
                    color: gridColor,
                    drawBorder: false
                },
                ticks: {
                    color: textColor,
                    font: { family: 'Inter', size: 11 }
                }
            },
            y: {
                grid: {
                    display: showGrid,
                    color: gridColor,
                    drawBorder: false
                },
                ticks: {
                    color: textColor,
                    font: { family: 'Inter', size: 11 }
                }
            }
        };
    }

    if (type === 'scatter') {
        if (config.options.scales.x) {
            config.options.scales.x.type = 'linear';
            config.options.scales.x.position = 'bottom';
        }
    }
    
    // Custom configurations based on chart type
    if (['horizontalBar', 'stackedHorizontalBar', 'percentStackedBar'].includes(type)) {
        config.options.indexAxis = 'y';
        if (config.options.scales.x) {
            config.options.scales.x.beginAtZero = true;
        }
    } else if (['bar', 'stackedBar', 'percentStackedColumn'].includes(type)) {
        if (config.options.scales.y) {
            config.options.scales.y.beginAtZero = true;
        }
    } else if (type === 'histogram') {
        if (config.options.scales.x) {
            config.options.scales.x.grid = { display: false };
            config.options.scales.x.title = { display: true, text: 'Continuous Value Bins', color: textColor, font: { family: 'Inter', size: 11, weight: '600' } };
        }
        if (config.options.scales.y) {
            config.options.scales.y.beginAtZero = true;
            config.options.scales.y.title = { display: true, text: 'Frequency (Count of Records)', color: textColor, font: { family: 'Inter', size: 11, weight: '600' } };
        }
        if (datasets[0]) {
            datasets[0].categoryPercentage = 0.98;
            datasets[0].barPercentage = 0.98;
        }
    }

    if (['stackedBar', 'stackedHorizontalBar', 'percentStackedColumn', 'percentStackedBar', 'lineStackedColumn'].includes(type)) {
        if (config.options.scales.x) config.options.scales.x.stacked = true;
        if (config.options.scales.y) config.options.scales.y.stacked = true;
    }

    if (type === 'percentStackedColumn') {
        if (config.options.scales.y) {
            config.options.scales.y.max = 100;
            config.options.scales.y.ticks.callback = function(value) { return value + '%'; };
        }
    } else if (type === 'percentStackedBar') {
        if (config.options.scales.x) {
            config.options.scales.x.max = 100;
            config.options.scales.x.ticks.callback = function(value) { return value + '%'; };
        }
    }

    if (['lineClusteredColumn', 'lineStackedColumn'].includes(type) && datasets.length > 1) {
        // Set secondary Y axis for the line dataset (which is the last dataset)
        const lineDatasetIndex = datasets.length - 1;
        datasets[lineDatasetIndex].type = 'line';
        datasets[lineDatasetIndex].yAxisID = 'y1';
        
        // Add secondary Y-axis config
        config.options.scales.y1 = {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
                color: textColor,
                font: { family: 'Inter', size: 11 }
            }
        };
    }

    if (type === 'area') {
        datasets.forEach(ds => {
            ds.fill = true;
            ds.backgroundColor = createLineGradient(ctx, ds.borderColor);
        });
    } else if (type === 'stackedArea') {
        datasets.forEach(ds => {
            ds.fill = true;
            ds.backgroundColor = createLineGradient(ctx, ds.borderColor);
        });
        if (config.options.scales.x) config.options.scales.x.stacked = true;
        if (config.options.scales.y) config.options.scales.y.stacked = true;
    } else if (config.type === 'bar') {
        config.options.borderRadius = type === 'histogram' ? 4 : 6;
        config.options.borderSkipped = false;
    }
    
    // Create new chart instance
    const chart = new Chart(ctx, config);
    activeChartInstances[canvasId] = chart;
    return chart;
}

/**
 * Creates a vertical gradient for line charts to make them glow.
 */
function createLineGradient(canvasElement, baseColor) {
    try {
        const ctx = canvasElement.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        
        // Extract color components
        let rgb = 'rgba(0, 242, 254';
        if (baseColor.startsWith('rgba')) {
            rgb = baseColor.substring(0, baseColor.lastIndexOf(','));
        } else if (baseColor.startsWith('#')) {
            // Simple hex to rgb
            const hex = baseColor.replace('#', '');
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            rgb = `rgba(${r}, ${g}, ${b}`;
        }
        
        gradient.addColorStop(0, `${rgb}, 0.45)`);
        gradient.addColorStop(0.5, `${rgb}, 0.15)`);
        gradient.addColorStop(1, `${rgb}, 0.0)`);
        return gradient;
    } catch (e) {
        return baseColor; // Fallback to base color on failure
    }
}

/**
 * Export a chart canvas as a PNG image download.
 */
function exportChartAsPNG(canvasId, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        showToast("Export Failed", "No chart canvas found to export.", "error");
        return;
    }

    const link = document.createElement('a');
    link.download = (title || 'chart').replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_') + '.png';
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
    showToast("Chart Exported", `Saved as ${link.download}`, "success");
}

/**
 * High-performance, interactive Canvas Heatmap Matrix Renderer
 */
function renderHeatmapCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const title = customOptions.title || "Correlation & Density Heatmap";

    // Extract xLabels and yLabels
    const xLabels = labels && labels.length > 0 ? labels : [...new Set((datasets[0]?.data || []).map(d => d.x))];
    const yLabels = [...new Set((datasets[0]?.data || []).map(d => d.y))];
    const cellData = datasets[0]?.data || [];

    // Layout dimensions
    const marginLeft = 110;
    const marginBottom = 60;
    const marginTop = 50;
    const marginRight = 30;
    const gridW = width - marginLeft - marginRight;
    const gridH = height - marginTop - marginBottom;

    const cellW = xLabels.length > 0 ? gridW / xLabels.length : gridW;
    const cellH = yLabels.length > 0 ? gridH / yLabels.length : gridH;

    // Draw background
    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    // Draw Title
    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, marginLeft, 30);

    // Draw Heatmap Cells
    yLabels.forEach((yCat, r) => {
        // Draw Y label
        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const labelY = marginTop + (r * cellH) + (cellH / 2);
        ctx.fillText(String(yCat).substring(0, 14), marginLeft - 10, labelY);

        xLabels.forEach((xCat, c) => {
            const cellX = marginLeft + (c * cellW);
            const cellY = marginTop + (r * cellH);

            // Find matching data point
            const pt = cellData.find(d => String(d.x) === String(xCat) && String(d.y) === String(yCat));
            const val = pt && pt.value !== null && pt.value !== undefined ? Number(pt.value) : 0;

            // Interpolate color based on value (-1 to 1 or 0 to 1)
            let color;
            if (val >= 0) {
                const norm = Math.min(Math.max(val, 0), 1);
                color = `rgba(0, 242, 254, ${0.15 + (norm * 0.75)})`; // Cyan glow
            } else {
                const norm = Math.min(Math.max(Math.abs(val), 0), 1);
                color = `rgba(255, 0, 127, ${0.15 + (norm * 0.75)})`; // Pink glow
            }

            // Cell rectangle
            ctx.fillStyle = color;
            ctx.fillRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.strokeRect(cellX + 2, cellY + 2, cellW - 4, cellH - 4);

            // Cell value text
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const displayTxt = !isNaN(val) ? (val % 1 === 0 ? val : val.toFixed(2)) : '-';
            ctx.fillText(displayTxt, cellX + (cellW / 2), cellY + (cellH / 2));
        });
    });

    // Draw X labels at bottom
    xLabels.forEach((xCat, c) => {
        const cellX = marginLeft + (c * cellW) + (cellW / 2);
        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(String(xCat).substring(0, 12), cellX, height - marginBottom + 12);
    });

    // Mock chart instance for consistency
    const fakeChart = {
        canvas: canvas,
        config: { type: 'heatmap' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderHeatmapCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Box-and-Whisker Plot Canvas Renderer
 */
function renderBoxPlotCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Box & Whisker Distribution";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 60, 30);

    if (dataPoints.length === 0) return null;

    const marginLeft = 80;
    const marginRight = 30;
    const marginTop = 50;
    const marginBottom = 60;
    const plotW = width - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    // Determine overall min and max
    let minVal = Math.min(...dataPoints.map(d => d.min));
    let maxVal = Math.max(...dataPoints.map(d => d.max));
    if (minVal === maxVal) { minVal -= 1; maxVal += 1; }
    const range = maxVal - minVal || 1;

    const getY = (val) => marginTop + plotH - ((val - minVal) / range) * plotH;

    // Draw Y axis Grid
    ctx.strokeStyle = theme.gridColor;
    ctx.fillStyle = theme.textColor;
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
        const gridVal = minVal + (range * (i / 5));
        const gridY = getY(gridVal);
        ctx.beginPath();
        ctx.moveTo(marginLeft, gridY);
        ctx.lineTo(width - marginRight, gridY);
        ctx.stroke();
        ctx.fillText(gridVal.toFixed(1), marginLeft - 10, gridY + 3);
    }

    const boxW = Math.min(plotW / dataPoints.length * 0.5, 60);
    const stepX = plotW / dataPoints.length;

    dataPoints.forEach((d, idx) => {
        const centerX = marginLeft + (idx * stepX) + (stepX / 2);
        const yMin = getY(d.min);
        const yQ1 = getY(d.q1);
        const yMed = getY(d.median);
        const yQ3 = getY(d.q3);
        const yMax = getY(d.max);

        // Draw Whisker Line
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(centerX, yMin);
        ctx.lineTo(centerX, yMax);
        ctx.stroke();

        // Whisker Caps
        ctx.beginPath();
        ctx.moveTo(centerX - (boxW / 3), yMin);
        ctx.lineTo(centerX + (boxW / 3), yMin);
        ctx.moveTo(centerX - (boxW / 3), yMax);
        ctx.lineTo(centerX + (boxW / 3), yMax);
        ctx.stroke();

        // Box IQR
        ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
        ctx.fillRect(centerX - (boxW / 2), yQ3, boxW, yQ1 - yQ3);
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.strokeRect(centerX - (boxW / 2), yQ3, boxW, yQ1 - yQ3);

        // Median Line
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(centerX - (boxW / 2), yMed);
        ctx.lineTo(centerX + (boxW / 2), yMed);
        ctx.stroke();

        // Category Label
        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(d[labels[0] || 'x'] || labels[idx] || `Item ${idx+1}`).substring(0, 10), centerX, height - marginBottom + 18);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'boxPlot' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderBoxPlotCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Funnel Chart Canvas Renderer
 */
function renderFunnelCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Conversion Stage Funnel";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const count = dataPoints.length || 1;
    const marginTop = 55;
    const stageH = (height - marginTop - 40) / count;
    const maxW = width * 0.75;
    const minW = width * 0.25;

    dataPoints.forEach((d, idx) => {
        const topPct = (d.percentage || (100 - (idx * 15))) / 100;
        const nextPct = (dataPoints[idx + 1]?.percentage || Math.max(d.percentage * 0.8, 10)) / 100;

        const wTop = minW + (maxW - minW) * topPct;
        const wBottom = idx === count - 1 ? wTop * 0.85 : minW + (maxW - minW) * nextPct;

        const yTop = marginTop + (idx * stageH);
        const yBottom = yTop + stageH - 6;

        const xCenter = width / 2;
        const xTopLeft = xCenter - (wTop / 2);
        const xTopRight = xCenter + (wTop / 2);
        const xBottomLeft = xCenter - (wBottom / 2);
        const xBottomRight = xCenter + (wBottom / 2);

        // Draw Stage Polygon
        ctx.beginPath();
        ctx.moveTo(xTopLeft, yTop);
        ctx.lineTo(xTopRight, yTop);
        ctx.lineTo(xBottomRight, yBottom);
        ctx.lineTo(xBottomLeft, yBottom);
        ctx.closePath();

        const grad = ctx.createLinearGradient(xTopLeft, yTop, xTopRight, yBottom);
        grad.addColorStop(0, `rgba(0, 242, 254, ${0.85 - (idx * 0.08)})`);
        grad.addColorStop(1, `rgba(155, 81, 224, ${0.85 - (idx * 0.08)})`);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.stroke();

        // Text labels inside stage
        const stageLabel = d[labels[0] || 'x'] || labels[idx] || `Stage ${idx+1}`;
        const valText = `${d.value || 0} (${d.percentage || 100}%)`;

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${stageLabel}: ${valText}`, xCenter, (yTop + yBottom) / 2);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'funnel' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderFunnelCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Waterfall Variance Chart Canvas Renderer
 */
function renderWaterfallCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Waterfall Variance Progression";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 60, 30);

    if (dataPoints.length === 0) return null;

    const marginLeft = 80;
    const marginRight = 30;
    const marginTop = 50;
    const marginBottom = 60;
    const plotW = width - marginLeft - marginRight;
    const plotH = height - marginTop - marginBottom;

    let minVal = Math.min(0, ...dataPoints.map(d => Math.min(d.start || 0, d.end || 0)));
    let maxVal = Math.max(...dataPoints.map(d => Math.max(d.start || 0, d.end || 0)));
    if (minVal === maxVal) maxVal += 10;
    const range = maxVal - minVal || 1;
    const getY = (val) => marginTop + plotH - ((val - minVal) / range) * plotH;

    const stepX = plotW / dataPoints.length;
    const barW = Math.min(stepX * 0.65, 55);

    dataPoints.forEach((d, idx) => {
        const x = marginLeft + (idx * stepX) + (stepX - barW) / 2;
        const yStart = getY(d.start || 0);
        const yEnd = getY(d.end || d.value || 0);
        const barY = Math.min(yStart, yEnd);
        const barH = Math.max(Math.abs(yStart - yEnd), 3);

        let color = '#00f2fe';
        if (d.type === 'positive' || (d.value >= 0 && d.type !== 'total')) {
            color = '#00e676'; // green
        } else if (d.type === 'negative' || d.value < 0) {
            color = '#ff1744'; // red
        } else if (d.type === 'total') {
            color = '#9b51e0'; // purple total
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, barY, barW, barH, 4);
        ctx.fill();

        // Value text
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Number(d.value || 0).toFixed(1), x + (barW / 2), barY - 5);

        // Category label
        ctx.fillStyle = theme.textColor;
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillText(String(d[labels[0] || 'x'] || labels[idx] || `Step ${idx+1}`).substring(0, 10), x + (barW / 2), height - marginBottom + 18);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'waterfall' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderWaterfallCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Treemap Area Canvas Renderer
 */
function renderTreemapCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Hierarchical Proportional Treemap";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const marginLeft = 30;
    const marginTop = 50;
    const mapW = width - 60;
    const mapH = height - 75;

    const colors = COLOR_PALETTES.cosmic.backgrounds;

    // Simple squarified layout simulation
    let curX = marginLeft;
    let curY = marginTop;
    let remW = mapW;
    let remH = mapH;

    dataPoints.slice(0, 15).forEach((d, idx) => {
        const share = (d.share || 10) / 100;
        const color = colors[idx % colors.length];

        let rectW, rectH;
        if (idx % 2 === 0) {
            rectW = Math.max(remW * Math.min(share * 2.5, 0.9), 50);
            rectH = remH;
            ctx.fillStyle = color;
            ctx.fillRect(curX, curY, rectW, rectH);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.strokeRect(curX, curY, rectW, rectH);

            ctx.fillStyle = '#ffffff';
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(String(d[labels[0] || 'x'] || labels[idx] || `Item ${idx+1}`).substring(0, 12), curX + 8, curY + 20);
            ctx.font = '600 10px Inter, sans-serif';
            ctx.fillText(`${d.share || 0}%`, curX + 8, curY + 36);

            curX += rectW;
            remW -= rectW;
        } else {
            rectW = remW;
            rectH = Math.max(remH * Math.min(share * 2.5, 0.9), 35);
            ctx.fillStyle = color;
            ctx.fillRect(curX, curY, rectW, rectH);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.strokeRect(curX, curY, rectW, rectH);

            ctx.fillStyle = '#ffffff';
            ctx.font = '700 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(String(d[labels[0] || 'x'] || labels[idx] || `Item ${idx+1}`).substring(0, 12), curX + 8, curY + 20);
            ctx.font = '600 10px Inter, sans-serif';
            ctx.fillText(`${d.share || 0}%`, curX + 8, curY + 36);

            curY += rectH;
            remH -= rectH;
        }
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'treemap' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderTreemapCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Speedometer Gauge Canvas Renderer
 */
function renderGaugeCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 500;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const info = datasets[0]?.data?.[0] || { current: 75, target: 100, percentage: 75 };
    const title = customOptions.title || "KPI Speedometer Gauge";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 24, 28);

    const centerX = width / 2;
    const centerY = height * 0.56;
    const radius = Math.min(width * 0.36, height * 0.38);

    // Background track arc (180 degrees)
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI);
    ctx.lineWidth = Math.min(24, radius * 0.22);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.stroke();

    // Active progress arc
    const pct = Math.min(Math.max((info.percentage || 75) / 100, 0), 1);
    const progressEndAngle = Math.PI + (pct * Math.PI);

    const grad = ctx.createLinearGradient(centerX - radius, centerY, centerX + radius, centerY);
    grad.addColorStop(0, '#00f2fe');
    grad.addColorStop(1, '#9b51e0');

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, progressEndAngle);
    ctx.lineWidth = Math.min(24, radius * 0.22);
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Center Big Value
    ctx.fillStyle = theme.isLight ? '#0f172a' : '#ffffff';
    ctx.font = '700 28px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatKPIValue(info.current), centerX, centerY - 6);

    ctx.fillStyle = '#00f2fe';
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText(`${info.percentage || 75}% of Target (${formatKPIValue(info.target)})`, centerX, centerY + 22);

    const fakeChart = {
        canvas: canvas,
        config: { type: 'gauge' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderGaugeCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Bullet Comparative Chart Canvas Renderer
 */
function renderBulletCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const info = datasets[0]?.data?.[0] || { current: 82, target: 100, max: 120 };
    const title = customOptions.title || "Performance Bullet Chart";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const barX = 60;
    const barY = height * 0.42;
    const barW = width - 120;
    const barH = 50;

    // 3 Threshold Bands (Poor, Satisfactory, Good)
    ctx.fillStyle = 'rgba(255, 23, 68, 0.2)';
    ctx.fillRect(barX, barY, barW * 0.4, barH);
    ctx.fillStyle = 'rgba(242, 201, 76, 0.2)';
    ctx.fillRect(barX + barW * 0.4, barY, barW * 0.35, barH);
    ctx.fillStyle = 'rgba(0, 230, 118, 0.2)';
    ctx.fillRect(barX + barW * 0.75, barY, barW * 0.25, barH);

    // Actual Performance Bar (Inner)
    const actualW = Math.min((info.current / (info.max || 120)) * barW, barW);
    ctx.fillStyle = '#00f2fe';
    ctx.fillRect(barX, barY + 12, actualW, barH - 24);

    // Target Marker Line
    const targetX = barX + Math.min((info.target / (info.max || 120)) * barW, barW);
    ctx.fillStyle = '#ff007f';
    ctx.fillRect(targetX - 2, barY - 8, 4, barH + 16);

    // Labels
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Actual: ${formatKPIValue(info.current)}`, barX, barY + barH + 30);
    ctx.fillStyle = '#ff007f';
    ctx.fillText(`Target: ${formatKPIValue(info.target)}`, targetX - 25, barY - 14);

    const fakeChart = {
        canvas: canvas,
        config: { type: 'bullet' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderBulletCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Project Gantt Timeline Canvas Renderer
 */
function renderGanttCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Milestone Gantt Timeline";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const marginLeft = 120;
    const marginTop = 60;
    const plotW = width - marginLeft - 40;
    const rowH = Math.min((height - marginTop - 40) / Math.max(dataPoints.length, 1), 38);

    dataPoints.slice(0, 10).forEach((d, idx) => {
        const y = marginTop + (idx * rowH);
        const taskName = String(d[labels[0] || 'x'] || labels[idx] || `Task ${idx+1}`).substring(0, 14);

        // Task label
        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(taskName, marginLeft - 12, y + (rowH / 2));

        // Background timeline bar
        const startOffset = (idx * 0.08) * plotW;
        const durationW = Math.min((0.25 + (idx * 0.05)) * plotW, plotW - startOffset);

        ctx.fillStyle = idx % 2 === 0 ? 'rgba(0, 242, 254, 0.75)' : 'rgba(155, 81, 224, 0.75)';
        ctx.beginPath();
        ctx.roundRect(marginLeft + startOffset, y + 6, durationW, rowH - 12, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Phase ${idx+1}`, marginLeft + startOffset + (durationW / 2), y + (rowH / 2) + 1);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'gantt' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderGanttCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Regional Geospatial Bubble Map Canvas Renderer
 */
function renderGeoMapCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Geospatial Regional Distribution Map";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    // World Grid Latitude / Longitude lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 60; x < width - 40; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 50); ctx.lineTo(x, height - 30); ctx.stroke();
    }
    for (let y = 60; y < height - 30; y += 40) {
        ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(width - 40, y); ctx.stroke();
    }

    // Mock Regional World Coordinate Hubs
    const geoHubs = [
        { name: "North America", x: width * 0.25, y: height * 0.4 },
        { name: "Europe", x: width * 0.52, y: height * 0.35 },
        { name: "Asia Pacific", x: width * 0.78, y: height * 0.45 },
        { name: "Latin America", x: width * 0.32, y: height * 0.68 },
        { name: "Middle East / Africa", x: width * 0.55, y: height * 0.58 }
    ];

    dataPoints.slice(0, geoHubs.length).forEach((d, idx) => {
        const hub = geoHubs[idx % geoHubs.length];
        const val = Number(d.value || d[Object.keys(d)[1]] || 100);
        const radius = Math.min(Math.max((val / 1000) * 15, 12), 35);

        // Glowing pulse circle
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, radius + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(hub.x, hub.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0, 242, 254, 0.85)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(d[labels[0] || 'x'] || hub.name), hub.x, hub.y + radius + 14);
        ctx.fillStyle = '#00f2fe';
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillText(formatKPIValue(val), hub.x, hub.y + radius + 26);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'geoMap' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderGeoMapCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Cross-Tab Table Matrix Renderer
 */
function renderTableMatrixDOM(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Structured Cross-Tab Matrix";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const tableX = 30;
    const tableY = 50;
    const tableW = width - 60;
    const rowH = 34;

    // Header Row
    ctx.fillStyle = 'rgba(0, 242, 254, 0.15)';
    ctx.fillRect(tableX, tableY, tableW, rowH);
    ctx.fillStyle = '#00f2fe';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText("Dimension / Category", tableX + 16, tableY + 21);
    ctx.textAlign = 'right';
    ctx.fillText("Aggregated Value", tableX + tableW - 16, tableY + 21);

    dataPoints.slice(0, 10).forEach((d, idx) => {
        const y = tableY + rowH + (idx * rowH);
        ctx.fillStyle = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0,0,0,0.15)';
        ctx.fillRect(tableX, y, tableW, rowH);

        const label = String(d[labels[0] || 'x'] || labels[idx] || `Row ${idx+1}`);
        const val = Number(d.value || d[Object.keys(d)[1]] || 0);

        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, tableX + 16, y + 21);

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val.toLocaleString(), tableX + tableW - 16, y + 21);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'tableMatrix' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderTableMatrixDOM(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Multi-Row Metric Badge Card Renderer
 */
function renderMultiCardDOM(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Multi-Row KPI Summary";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const cardW = (width - 100) / 2;
    const cardH = (height - 120) / 2;

    const cards = [
        { label: "Total Volume", val: dataPoints.length || 100, icon: "Σ" },
        { label: "Primary Average", val: "42.8", icon: "μ" },
        { label: "Peak Milestone", val: "98.4%", icon: "★" },
        { label: "Health Index", val: "Optimal", icon: "✓" }
    ];

    cards.forEach((c, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const x = 40 + (col * (cardW + 20));
        const y = 60 + (row * (cardH + 20));

        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.roundRect(x, y, cardW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.2)';
        ctx.stroke();

        ctx.fillStyle = '#00f2fe';
        ctx.font = '700 22px Outfit, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(String(c.val), x + 18, y + 36);

        ctx.fillStyle = theme.textColor;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.fillText(c.label, x + 18, y + 56);
    });

    const fakeChart = {
        canvas: canvas,
        config: { type: 'multiCard' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderMultiCardDOM(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}

/**
 * Ribbon Flow Ranking Canvas Renderer
 */
function renderRibbonCanvas(canvasId, labels, datasets, customOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    destroyChartInstance(canvasId);

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;
    const width = parent.clientWidth || 600;
    const height = (parent.clientHeight && parent.clientHeight > 100) ? parent.clientHeight : 380;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const theme = getThemeColors();
    const dataPoints = datasets[0]?.data || [];
    const title = customOptions.title || "Ribbon Flow Ranking Chart";

    ctx.fillStyle = theme.isLight ? '#ffffff' : '#0a0d1d';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = theme.titleColor;
    ctx.font = '700 15px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(title, 40, 30);

    const marginLeft = 60;
    const marginTop = 60;
    const plotW = width - marginLeft - 40;
    const plotH = height - marginTop - 40;

    const colors = COLOR_PALETTES.cosmic.backgrounds;

    // Draw flowing ribbons across time periods
    const steps = 4;
    for (let i = 0; i < Math.min(dataPoints.length || 3, 3); i++) {
        ctx.beginPath();
        const yStart = marginTop + (i * (plotH / 3)) + 20;
        ctx.moveTo(marginLeft, yStart);
        ctx.bezierCurveTo(
            marginLeft + (plotW * 0.35), yStart + 30,
            marginLeft + (plotW * 0.65), yStart - 20,
            marginLeft + plotW, yStart + 10
        );
        ctx.lineWidth = 18;
        ctx.strokeStyle = colors[i % colors.length];
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px Inter, sans-serif';
        ctx.fillText(`Rank #${i+1}`, marginLeft + 10, yStart - 12);
    }

    const fakeChart = {
        canvas: canvas,
        config: { type: 'ribbon' },
        data: { labels: labels, datasets: datasets },
        options: { plugins: { title: { text: title } } },
        destroy: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); },
        resize: () => { renderRibbonCanvas(canvasId, labels, datasets, customOptions); }
    };
    activeChartInstances[canvasId] = fakeChart;
    return fakeChart;
}
