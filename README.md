# 🌬️ AirWatch BD — AI-Powered Air Quality Monitoring for Bangladesh

<div align="center">

[![GEE App](https://img.shields.io/badge/🚀_Launch-GEE_App-00d4ff?style=for-the-badge&labelColor=0d1117)](https://raunaqpreetom88.users.earthengine.app/view/air-watch-bangladesh)
[![Landing Page](https://img.shields.io/badge/🌐_Dashboard-AI_Assistant-ab47bc?style=for-the-badge&labelColor=0d1117)](https://raunaqpreetom88.github.io/AirWatch-BD/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge&labelColor=0d1117)](LICENSE)

**AI-powered air quality monitoring, emissions tracking, carbon credit assessment, and health advisory system for Dhaka City using Sentinel-5P TROPOMI on Google Earth Engine.**

**Developed by [Mashiyat Raunaq Preetom](https://github.com/raunaqpreetom88)** — Junior Research Fellow, SPARRSO | Dept. of Environmental Science, BUP

[Launch App](https://raunaqpreetom88.users.earthengine.app/view/air-watch-bangladesh) · [AI Dashboard](https://raunaqpreetom88.github.io/AirWatch-BD/) · [Report Bug](https://github.com/raunaqpreetom88/AirWatch-BD/issues)

</div>

---

## 🔍 Overview

**AirWatch BD** is a comprehensive, browser-based air quality monitoring platform built on **Google Earth Engine (GEE)** with an integrated **AI Emissions & Carbon Credit Assistant** powered by Claude AI. It provides multi-temporal analysis of 7 atmospheric pollutants over Dhaka City — the world's most polluted megacity.

### Key Numbers
- **17M+** residents exposed to hazardous air daily
- **80,000+** premature deaths linked to air pollution in Bangladesh (2022)
- **ZERO** real-time, public, multi-pollutant monitoring platforms existed before AirWatch BD

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Emissions Assistant** | Claude-powered chatbot for carbon footprint calculation, Kyoto Protocol compensation, emission trading, and policy brief generation |
| 🛰️ **7 Pollutants × 3 Modes** | NO₂, SO₂, CO, O₃, HCHO, UVAI, CH₄ at annual/monthly/daily resolution |
| 🛡️ **12-Factor Vulnerability** | Weighted composite: pollutants + population + LST + green deficit + NTL + precipitation + wind |
| 🏛️ **Admin-Level Analysis** | Upazila → Union cascading selector with comparison vs city average |
| 🏭 **Pollution Source Mapping** | 24 verified sites + WRI power plants + VIIRS thermal hotspots |
| 🔀 **Split-Panel Comparison** | Wipe view for two pollutants/years with linked zoom |
| 📈 **Trend & Anomaly** | 5 chart types with R² trendlines |
| 🔥 **11-Variable Correlation** | Pearson heatmap across all pollutants + environmental variables |
| 🏥 **Health Advisory** | 6-tier WHO-referenced classification |

---

## 📡 Datasets

| Dataset | Provider | Resolution | Use |
|---|---|---|---|
| Sentinel-5P TROPOMI | Copernicus/ESA | 5.5×3.5 km | 7 pollutant columns |
| ERA5-Land Monthly | ECMWF | ~9 km | Wind speed |
| CHIRPS Daily | UCSB-CHG | ~5.5 km | Precipitation |
| MODIS MOD11A1/MOD13A2 | NASA | 1 km | LST + NDVI |
| VIIRS DNB + VNP14A1 | NOAA | 375-500 m | NTL + thermal hotspots |
| WorldPop | U. Southampton | 100 m | Population density |
| WRI Power Plants | WRI | Point | Power plant locations |
| Claude Sonnet 4 | Anthropic | API | AI emissions calculator |

---

## 🚀 Getting Started

### Option A: Use the live app
👉 [raunaqpreetom88.users.earthengine.app/view/air-watch-bangladesh](https://raunaqpreetom88.users.earthengine.app/view/air-watch-bangladesh)

### Option B: AI Dashboard with Emissions Assistant
👉 [raunaqpreetom88.github.io/AirWatch-BD/](https://raunaqpreetom88.github.io/AirWatch-BD/)

### Option C: Run in GEE Code Editor
1. Open [GEE Code Editor](https://code.earthengine.google.com/)
2. Paste `AirWatch_BD_v4_2.js` into a new script
3. Update admin boundary asset paths (lines 33-37) to your GEE project
4. Click **Run**

---

## 📁 Project Structure

```
AirWatch-BD/
├── index.html              # Landing page + AI Emissions Assistant
├── AirWatch_BD_v4_2.js     # Main GEE application (2,300+ lines)
├── README.md
└── LICENSE
```

---

## 👤 Developer

**Mashiyat Raunaq Preetom** — Sole Developer & Lead Researcher

- Junior Research Fellow, [SPARRSO](http://www.sparrso.gov.bd) (Space Research & Remote Sensing Organization), Bangladesh
- Department of Environmental Science, Bangladesh University of Professionals (BUP)
- President, BUP YouthMappers
- Founder, QGIS Bangladesh User Group

[![GitHub](https://img.shields.io/badge/GitHub-raunaqpreetom88-181717?style=flat-square&logo=github)](https://github.com/raunaqpreetom88)

---

## 📜 License

MIT License — see [LICENSE](LICENSE)

---

<div align="center">
<sub>Built with Google Earth Engine • Sentinel-5P TROPOMI • Claude AI by Anthropic</sub>
</div>
