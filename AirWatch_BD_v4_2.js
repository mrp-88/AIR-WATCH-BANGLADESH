/*  ╔═══════════════════════════════════════════════════════════════════════╗
    ║  AirWatch BD v4.1 – Intelligent Air Quality Monitoring               ║
    ║  Google Earth Engine Application                                     ║
    ║  Data  : Sentinel-5P TROPOMI, ERA5, CHIRPS, MODIS, WorldPop,        ║
    ║          VIIRS NTL, WRI Power Plants  (2020 – 2025)                  ║
    ║  AOI   : FAO GAUL Admin-2 – Dhaka City                              ║
    ║  Admin : FieldMaps COD ADM3 (Thana) + ADM4 (Union)                  ║
    ║  NEW   : Thana/Union selector, industry point sources, admin overlay ║
    ╚═══════════════════════════════════════════════════════════════════════╝ */

// ──────────────────────────────────────────────────────────────────────
// 0.  CONFIGURATION
// ──────────────────────────────────────────────────────────────────────
var START_YEAR = 2020;
var END_YEAR   = 2025;
var START_DATE = '2020-01-01';
var END_DATE   = '2025-12-31';

var MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];

var DRY_MONTHS  = [11, 12, 1, 2, 3];
var WET_MONTHS  = [4, 5, 6, 7, 8, 9, 10];

// ──────────────────────────────────────────────────────────────────────
// 1.  AREA OF INTEREST  +  SUB-DISTRICT BOUNDARIES
// ──────────────────────────────────────────────────────────────────────
var gaul2   = ee.FeatureCollection('FAO/GAUL/2015/level2');
var dhaka   = gaul2.filter(ee.Filter.eq('ADM2_NAME', 'Dhaka'));
var aoiGeom = dhaka.geometry();

// ── ADM3 (Upazila/Thana) from user asset ──
var adm3_dhaka = ee.FeatureCollection(
  'projects/thesis-environment-science/assets/upazillla');

// ── ADM4 (Union/Ward) from user asset ──
var adm4_dhaka = ee.FeatureCollection(
  'projects/thesis-environment-science/assets/dunion');

// Track currently selected sub-admin geometry (defaults to full AOI)
var currentSubAdminGeom = aoiGeom;
var currentSubAdminLabel = 'Dhaka City (Full)';

// ──────────────────────────────────────────────────────────────────────
// 1b. INDUSTRY / POLLUTION POINT SOURCES
// ──────────────────────────────────────────────────────────────────────

// ── A) WRI Global Power Plant Database ──
var powerPlants = ee.FeatureCollection('WRI/GPPD/power_plants')
  .filterBounds(aoiGeom.buffer(20000));  // 20km buffer to catch nearby plants

// ── B) VIIRS Active Fire / Thermal Anomalies (proxy for brick kilns, factories) ──
//    Persistent hotspots indicate industrial combustion
var viirsFires = ee.ImageCollection('NOAA/VIIRS/001/VNP14A1')
  .filterDate('2023-01-01','2024-12-31')
  .filterBounds(aoiGeom.buffer(10000))
  .select('MaxFRP');
var fireCount = viirsFires.count().clip(aoiGeom.buffer(10000));
// Extract persistent hotspot locations (fire detected in >5 composites)
var persistentFire = fireCount.gt(5).selfMask();

// ── C) Dynamic World Industrial Land Use ──
//    Class 6 = "Built Area" — filter by high confidence + VIIRS NTL correlation
var dwIndustrial = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
  .filterDate('2023-01-01','2024-12-31')
  .filterBounds(aoiGeom)
  .select('label').mode().clip(aoiGeom);
// Built area class = 6; we'll use NTL to isolate industrial vs residential
var builtArea = dwIndustrial.eq(6);

// ── D) Known Major Industrial Zones / Pollution Sources in Dhaka ──
//    Hand-verified from OSM, BIWTA, DoE, and SPARRSO records
var knownIndustry = ee.FeatureCollection([
  // Garment & Textile clusters
  ee.Feature(ee.Geometry.Point([90.3563, 23.7740]), {name:'Tejgaon Industrial Area', type:'Mixed Industry', icon:'🏭'}),
  ee.Feature(ee.Geometry.Point([90.3680, 23.7820]), {name:'Tejgaon Truck Stand / Depot', type:'Transport/Logistics', icon:'🚛'}),
  ee.Feature(ee.Geometry.Point([90.4210, 23.7290]), {name:'Shyampur Industrial Zone', type:'Tannery/Chemical', icon:'🧪'}),
  ee.Feature(ee.Geometry.Point([90.4080, 23.7340]), {name:'Hazaribagh Tannery Area', type:'Tannery/Chemical', icon:'🧪'}),
  ee.Feature(ee.Geometry.Point([90.3350, 23.8750]), {name:'Tongi Industrial Area', type:'Garment/Textile', icon:'🏭'}),
  ee.Feature(ee.Geometry.Point([90.2700, 23.8510]), {name:'Ashulia Garment Zone', type:'Garment/Textile', icon:'🏭'}),
  ee.Feature(ee.Geometry.Point([90.2580, 23.8610]), {name:'Savar EPZ', type:'Export Processing', icon:'🏭'}),
  ee.Feature(ee.Geometry.Point([90.4310, 23.6920]), {name:'Narayanganj Industrial Area', type:'Jute/Textile', icon:'🏭'}),
  ee.Feature(ee.Geometry.Point([90.3300, 23.7600]), {name:'Mohammadpur Industrial Area', type:'Mixed Industry', icon:'🏭'}),
  // Power plants
  ee.Feature(ee.Geometry.Point([90.4270, 23.7500]), {name:'Haripur Power Station', type:'Power Plant (Gas)', icon:'⚡'}),
  ee.Feature(ee.Geometry.Point([90.3870, 23.8190]), {name:'Siddhirganj Power Plant', type:'Power Plant (Gas/Oil)', icon:'⚡'}),
  ee.Feature(ee.Geometry.Point([90.5090, 23.6330]), {name:'Meghnaghat Power Plant', type:'Power Plant (Gas)', icon:'⚡'}),
  ee.Feature(ee.Geometry.Point([90.4580, 23.6200]), {name:'Haripur 412 MW CCPP', type:'Power Plant (CCGT)', icon:'⚡'}),
  // Brick kilns clusters (major known clusters peri-urban Dhaka)
  ee.Feature(ee.Geometry.Point([90.2900, 23.9100]), {name:'Savar Brick Kiln Cluster', type:'Brick Kiln', icon:'🧱'}),
  ee.Feature(ee.Geometry.Point([90.4800, 23.6800]), {name:'Keraniganj Brick Kilns', type:'Brick Kiln', icon:'🧱'}),
  ee.Feature(ee.Geometry.Point([90.2100, 23.8400]), {name:'Dhamrai Brick Kiln Belt', type:'Brick Kiln', icon:'🧱'}),
  ee.Feature(ee.Geometry.Point([90.5200, 23.7500]), {name:'Rupganj Brick Kiln Area', type:'Brick Kiln', icon:'🧱'}),
  ee.Feature(ee.Geometry.Point([90.3650, 23.9400]), {name:'Gazipur Brick Kiln Zone', type:'Brick Kiln', icon:'🧱'}),
  // Waste & cement
  ee.Feature(ee.Geometry.Point([90.4350, 23.7750]), {name:'Matuail Landfill', type:'Waste/Landfill', icon:'🗑️'}),
  ee.Feature(ee.Geometry.Point([90.3880, 23.6900]), {name:'Amin Bazar Landfill', type:'Waste/Landfill', icon:'🗑️'}),
  // Ship breaking / dockyards
  ee.Feature(ee.Geometry.Point([90.4150, 23.7050]), {name:'Buriganga Dockyard Area', type:'Shipyard/Dockyard', icon:'🚢'}),
  // Food processing / pharmaceuticals
  ee.Feature(ee.Geometry.Point([90.3400, 23.9050]), {name:'Tongi Pharma/Food Zone', type:'Pharmaceutical', icon:'💊'}),
  ee.Feature(ee.Geometry.Point([90.3780, 23.8380]), {name:'Uttara Industrial Zone', type:'Light Industry', icon:'🏭'})
]);

// ──────────────────────────────────────────────────────────────────────
// 2.  POLLUTANT CATALOGUE
// ──────────────────────────────────────────────────────────────────────
var pollutants = {
  'NO₂ (Nitrogen Dioxide)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_NO2',
    band: 'tropospheric_NO2_column_number_density',
    scale: 1e6, unit: 'µmol/m²',
    palette: ['#00e400','#92d050','#ffff00','#ff7e00','#ff0000','#7e0023','#4c0000'],
    visMin: 0, visMax: 200,
    who: 'WHO AQG: 10 µg/m³ annual mean',
    ticks: [0, 40, 80, 120, 160, 200]
  },
  'SO₂ (Sulfur Dioxide)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_SO2',
    band: 'SO2_column_number_density',
    scale: 1e6, unit: 'µmol/m²',
    palette: ['#f7fcf5','#d5efcf','#9ed898','#5bb55a','#238b45','#006d2c','#00441b'],
    visMin: 0, visMax: 500,
    who: 'WHO AQG: 40 µg/m³ (24-hr)',
    ticks: [0, 100, 200, 300, 400, 500]
  },
  'CO (Carbon Monoxide)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_CO',
    band: 'CO_column_number_density',
    scale: 1e3, unit: 'mmol/m²',
    palette: ['#f7fbff','#d2e3f3','#9ecae1','#6baed6','#3182bd','#08519c','#08306b'],
    visMin: 20, visMax: 50,
    who: 'WHO AQG: 4 mg/m³ (24-hr)',
    ticks: [20, 25, 30, 35, 40, 45, 50]
  },
  'O₃ (Ozone)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_O3',
    band: 'O3_column_number_density',
    scale: 1e3, unit: 'mmol/m²',
    palette: ['#fff5eb','#fee0c1','#fdd0a2','#fdae6b','#fd8d3c','#d94801','#7f2704'],
    visMin: 100, visMax: 160,
    who: 'WHO AQG: 100 µg/m³ (8-hr)',
    ticks: [100, 110, 120, 130, 140, 150, 160]
  },
  'HCHO (Formaldehyde)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_HCHO',
    band: 'tropospheric_HCHO_column_number_density',
    scale: 1e6, unit: 'µmol/m²',
    palette: ['#f7fcf5','#d9f0d3','#addd8e','#78c679','#41ab5d','#238443','#005a32'],
    visMin: 0, visMax: 200,
    who: 'Indoor: 100 µg/m³ (30-min)',
    ticks: [0, 40, 80, 120, 160, 200]
  },
  'Aerosol Index (UVAI)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_AER_AI',
    band: 'absorbing_aerosol_index',
    scale: 1, unit: 'Index',
    palette: ['#2166ac','#4393c3','#92c5de','#f7f7f7','#fddbc7','#f4a582','#d6604d','#b2182b'],
    visMin: -1, visMax: 3,
    who: 'PM₂.₅ proxy; WHO: 5 µg/m³ annual',
    ticks: [-1, 0, 1, 2, 3]
  },
  'CH₄ (Methane)': {
    collection: 'COPERNICUS/S5P/OFFL/L3_CH4',
    band: 'CH4_column_volume_mixing_ratio_dry_air',
    scale: 1, unit: 'ppb',
    palette: ['#ffffcc','#d9f0a3','#addd8e','#78c679','#41b6c4','#2c7fb8','#253494'],
    visMin: 1800, visMax: 1950,
    who: 'GHG – no direct health AQG',
    ticks: [1800, 1825, 1850, 1875, 1900, 1925, 1950]
  }
};

// ──────────────────────────────────────────────────────────────────────
// 2b. SUPPLEMENTARY DATASETS
// ──────────────────────────────────────────────────────────────────────
var supplementary = {
  'Wind Speed (ERA5)': {
    getImage: function(yr) {
      var u = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .select('u_component_of_wind_10m').mean().clip(aoiGeom);
      var v = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .select('v_component_of_wind_10m').mean().clip(aoiGeom);
      return u.pow(2).add(v.pow(2)).sqrt().rename('wind_speed');
    },
    unit:'m/s', palette:['#f7fbff','#c6dbef','#6baed6','#3182bd','#08519c'],
    visMin:0, visMax:5, ticks:[0,1,2,3,4,5],
    description:'10m wind speed – pollutant dispersion'
  },
  'Rainfall (CHIRPS)': {
    getImage: function(yr) {
      return ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .sum().clip(aoiGeom).rename('precip');
    },
    unit:'mm/yr', palette:['#ffffcc','#a1dab4','#41b6c4','#2c7fb8','#253494'],
    visMin:500, visMax:3000, ticks:[500,1000,1500,2000,2500,3000],
    description:'Annual precipitation – aerosol washout'
  },
  'Land Surface Temp (MODIS)': {
    getImage: function(yr) {
      return ee.ImageCollection('MODIS/061/MOD11A1')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .select('LST_Day_1km').mean().multiply(0.02).subtract(273.15)
        .clip(aoiGeom).rename('LST');
    },
    unit:'°C', palette:['#313695','#4575b4','#74add1','#abd9e9','#fee090','#fdae61','#f46d43','#d73027','#a50026'],
    visMin:20, visMax:45, ticks:[20,25,30,35,40,45],
    description:'Urban heat island proxy'
  },
  'NDVI (MODIS)': {
    getImage: function(yr) {
      return ee.ImageCollection('MODIS/061/MOD13A2')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .select('NDVI').mean().multiply(0.0001).clip(aoiGeom).rename('NDVI');
    },
    unit:'Index', palette:['#d73027','#fc8d59','#fee08b','#d9ef8b','#91cf60','#1a9850'],
    visMin:0, visMax:0.8, ticks:[0,0.2,0.4,0.6,0.8],
    description:'Vegetation / green space'
  },
  'Nighttime Lights (VIIRS)': {
    getImage: function(yr) {
      return ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
        .filterDate(yr+'-01-01',yr+'-12-31').filterBounds(aoiGeom)
        .select('avg_rad').mean().clip(aoiGeom).rename('NTL');
    },
    unit:'nW/cm²/sr', palette:['#000004','#420a68','#932667','#dd513a','#fca50a','#fcffa4'],
    visMin:0, visMax:60, ticks:[0,10,20,30,40,50,60],
    description:'Urbanisation proxy'
  },
  'Population Density (WorldPop)': {
    getImage: function(yr) {
      return ee.ImageCollection('WorldPop/GP/100m/pop')
        .filterDate('2020-01-01','2020-12-31')
        .filter(ee.Filter.eq('country','BGD')).mosaic().clip(aoiGeom).rename('pop');
    },
    unit:'persons/px', palette:['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#fc4e2a','#e31a1c','#b10026'],
    visMin:0, visMax:50000, ticks:[0,10000,20000,30000,40000,50000],
    description:'Exposure weighting'
  }
};

// ──────────────────────────────────────────────────────────────────────
// 2c. HEALTH CATEGORIES
// ──────────────────────────────────────────────────────────────────────
var healthCategories = [
  {maxRatio:0.20,label:'Good',color:'#00e400',icon:'🟢',
   advice:'Air quality is satisfactory.',
   health:'No health risk.',
   guideline:'No precautions needed.'},
  {maxRatio:0.40,label:'Moderate',color:'#ffff00',icon:'🟡',
   advice:'Acceptable. Sensitive people should limit prolonged outdoor exertion.',
   health:'Minor irritation for very sensitive individuals.',
   guideline:'Sensitive groups reduce outdoor exertion.'},
  {maxRatio:0.60,label:'Unhealthy (Sensitive)',color:'#ff7e00',icon:'🟠',
   advice:'Sensitive groups may experience health effects.',
   health:'Increased respiratory symptoms in sensitive groups.',
   guideline:'Sensitive groups avoid outdoor exertion. N95 masks.'},
  {maxRatio:0.80,label:'Unhealthy',color:'#ff0000',icon:'🔴',
   advice:'Everyone may begin to experience health effects.',
   health:'Aggravation of respiratory & cardiovascular disease.',
   guideline:'Avoid outdoor exertion. Close windows. Air purifiers.'},
  {maxRatio:1.00,label:'Very Unhealthy',color:'#7e0023',icon:'🟣',
   advice:'Health alert — serious effects for everyone.',
   health:'Significant disease aggravation.',
   guideline:'Stay indoors. Cancel outdoor events. HEPA filters.'},
  {maxRatio:Infinity,label:'Hazardous',color:'#4c0000',icon:'☠️',
   advice:'EMERGENCY — entire population affected.',
   health:'Serious respiratory & cardiovascular risk.',
   guideline:'REMAIN INDOORS. Seal openings. Max air purifiers.'}
];

function getHealthCategory(key, value) {
  if (value===null||value===undefined||isNaN(value)) return null;
  var p = pollutants[key];
  var ratio = (value - p.visMin)/(p.visMax - p.visMin);
  for (var i=0; i<healthCategories.length; i++) {
    if (ratio <= healthCategories[i].maxRatio) return healthCategories[i];
  }
  return healthCategories[healthCategories.length-1];
}

// ──────────────────────────────────────────────────────────────────────
// 3.  HELPER FUNCTIONS
// ──────────────────────────────────────────────────────────────────────
function annualMean(key, year) {
  var p = pollutants[key];
  return ee.ImageCollection(p.collection)
    .filterDate(year+'-01-01', year+'-12-31')
    .filterBounds(aoiGeom).select(p.band)
    .mean().multiply(p.scale).clip(aoiGeom)
    .set('year',year).set('pollutant',key);
}

function monthlyMeanImage(key, year, month) {
  var p = pollutants[key];
  var mStr = (month<10)?'0'+month:''+month;
  var start = ee.Date(year+'-'+mStr+'-01');
  return ee.ImageCollection(p.collection)
    .filterDate(start, start.advance(1,'month'))
    .filterBounds(aoiGeom).select(p.band)
    .mean().multiply(p.scale).clip(aoiGeom)
    .set('year',year).set('month',month).set('pollutant',key);
}

function dailyMeanImage(key, dateStr) {
  var p = pollutants[key];
  var start = ee.Date(dateStr);
  return ee.ImageCollection(p.collection)
    .filterDate(start, start.advance(1,'day'))
    .filterBounds(aoiGeom).select(p.band)
    .mean().multiply(p.scale).clip(aoiGeom)
    .set('date',dateStr).set('pollutant',key);
}

function monthlyTimeSeries(key) {
  var p = pollutants[key];
  var analysisGeom = getAnalysisGeom();
  var col = ee.ImageCollection(p.collection)
    .filterDate(START_DATE,END_DATE).filterBounds(aoiGeom).select(p.band);
  var months = ee.List.sequence(0,(END_YEAR-START_YEAR+1)*12-1);
  return ee.FeatureCollection(months.map(function(m){
    m = ee.Number(m);
    var s = ee.Date(START_DATE).advance(m,'month');
    var v = col.filterDate(s,s.advance(1,'month')).mean()
      .multiply(p.scale).reduceRegion({
        reducer:ee.Reducer.mean(),geometry:analysisGeom,
        scale:5000,maxPixels:1e9}).get(p.band);
    return ee.Feature(null,{date:s.millis(),value:v,'system:time_start':s.millis()});
  }));
}

// ──────────────────────────────────────────────────────────────────────
// 3b. COMPOSITE AQI
// ──────────────────────────────────────────────────────────────────────
function computeCompositeAQI(year) {
  function N(img,mn,mx){return img.unitScale(mn,mx).clamp(0,1);}
  var no2 = N(annualMean('NO₂ (Nitrogen Dioxide)',year),0,200);
  var so2 = N(annualMean('SO₂ (Sulfur Dioxide)',year),0,500);
  var co  = N(annualMean('CO (Carbon Monoxide)',year),20,50);
  var o3  = N(annualMean('O₃ (Ozone)',year),100,160);
  var aer = N(annualMean('Aerosol Index (UVAI)',year),-1,3);
  var hcho= N(annualMean('HCHO (Formaldehyde)',year),0,200);
  return no2.multiply(0.25).add(aer.multiply(0.25))
    .add(co.multiply(0.15)).add(so2.multiply(0.15))
    .add(o3.multiply(0.10)).add(hcho.multiply(0.10))
    .rename('AQI_composite');
}

// ──────────────────────────────────────────────────────────────────────
// 3c. ANOMALY DETECTION
// ──────────────────────────────────────────────────────────────────────
function computeAnomalyTS(key) {
  var p = pollutants[key];
  var col = ee.ImageCollection(p.collection)
    .filterDate(START_DATE,END_DATE).filterBounds(aoiGeom).select(p.band);
  var nMonths = (END_YEAR-START_YEAR+1)*12;
  var months = ee.List.sequence(0,nMonths-1);
  var climatology = ee.List.sequence(1,12).map(function(cm){
    cm = ee.Number(cm);
    var allYearsForMonth = ee.List.sequence(START_YEAR,END_YEAR).map(function(y){
      y = ee.Number(y);
      var s = ee.Date.fromYMD(y,cm,1);
      return col.filterDate(s,s.advance(1,'month')).mean();
    });
    return ee.ImageCollection.fromImages(allYearsForMonth).mean()
      .multiply(p.scale).reduceRegion({
        reducer:ee.Reducer.mean(),geometry:aoiGeom,
        scale:5000,maxPixels:1e9}).get(p.band);
  });
  return ee.FeatureCollection(months.map(function(m){
    m = ee.Number(m);
    var s = ee.Date(START_DATE).advance(m,'month');
    var calMonth = s.get('month');
    var longTermMean = ee.Number(climatology.get(calMonth.subtract(1)));
    var thisMonthVal = col.filterDate(s,s.advance(1,'month')).mean()
      .multiply(p.scale).reduceRegion({
        reducer:ee.Reducer.mean(),geometry:aoiGeom,
        scale:5000,maxPixels:1e9}).get(p.band);
    var anomaly = ee.Number(thisMonthVal).subtract(longTermMean);
    return ee.Feature(null,{date:s.millis(),value:thisMonthVal,
      anomaly:anomaly,'system:time_start':s.millis()});
  }));
}

// ──────────────────────────────────────────────────────────────────────
// 4.  VULNERABILITY ASSESSMENT (12 factors)
// ──────────────────────────────────────────────────────────────────────
function computeVulnerability(year) {
  var yr = year||2024;
  var yrs=yr+'-01-01', yre=yr+'-12-31';
  function N(img,mn,mx){return img.unitScale(mn,mx).clamp(0,1);}
  var no2  = N(annualMean('NO₂ (Nitrogen Dioxide)',yr),0,200);
  var so2  = N(annualMean('SO₂ (Sulfur Dioxide)',yr),0,500);
  var co   = N(annualMean('CO (Carbon Monoxide)',yr),20,50);
  var aero = N(annualMean('Aerosol Index (UVAI)',yr),-1,3);
  var ch4  = N(annualMean('CH₄ (Methane)',yr),1800,1950);
  var pop = ee.ImageCollection('WorldPop/GP/100m/pop')
    .filterDate('2020-01-01','2020-12-31')
    .filter(ee.Filter.eq('country','BGD')).mosaic().clip(aoiGeom);
  var popN = N(pop,0,50000);
  var lst = ee.ImageCollection('MODIS/061/MOD11A1')
    .filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('LST_Day_1km').mean().multiply(0.02).subtract(273.15).clip(aoiGeom);
  var lstN = N(lst,20,45);
  var ndvi = ee.ImageCollection('MODIS/061/MOD13A2')
    .filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('NDVI').mean().multiply(0.0001).clip(aoiGeom);
  var greenDef = ee.Image(1).subtract(N(ndvi,0,0.8)).clip(aoiGeom);
  var ntl = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
    .filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('avg_rad').mean().clip(aoiGeom);
  var ntlN = N(ntl,0,60);
  var precip = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
    .filterDate(yrs,yre).filterBounds(aoiGeom).sum().clip(aoiGeom);
  var precipDeficit = ee.Image(1).subtract(N(precip,500,3000)).clip(aoiGeom);
  var u10 = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
    .filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('u_component_of_wind_10m').mean().clip(aoiGeom);
  var v10 = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')
    .filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('v_component_of_wind_10m').mean().clip(aoiGeom);
  var ws = u10.pow(2).add(v10.pow(2)).sqrt();
  var lowWind = ee.Image(1).subtract(N(ws,0,5)).clip(aoiGeom);
  return no2.multiply(0.15).add(so2.multiply(0.07)).add(co.multiply(0.07))
    .add(aero.multiply(0.10)).add(ch4.multiply(0.03))
    .add(popN.multiply(0.15)).add(lstN.multiply(0.10))
    .add(greenDef.multiply(0.08)).add(ntlN.multiply(0.08))
    .add(precipDeficit.multiply(0.07)).add(lowWind.multiply(0.05))
    .rename('vulnerability');
}

// ──────────────────────────────────────────────────────────────────────
// 5.  UI COLOURS & STYLES
// ──────────────────────────────────────────────────────────────────────
var DARK_BG     = '#0f0f1a';
var PANEL_BG    = '#1a1a2e';
var ACCENT      = '#00d4ff';
var ACCENT2     = '#00ff88';
var TEXT_PRIMARY = '#e0e0e0';
var TEXT_MUTED   = '#888888';
var BORDER       = '#333355';
var WARN_BG      = '#2a1a1a';

var headingStyle = {fontSize:'15px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG,margin:'12px 0 3px 0'};
var labelStyle   = {fontSize:'12px',color:TEXT_PRIMARY,backgroundColor:PANEL_BG};
var mutedStyle   = {fontSize:'11px',color:TEXT_MUTED,backgroundColor:PANEL_BG};
var subHeadStyle = {fontSize:'13px',fontWeight:'bold',color:'#ccc',backgroundColor:PANEL_BG,margin:'8px 0 2px 0'};
var dividerStyle = {color:BORDER,backgroundColor:PANEL_BG,fontSize:'8px'};
var spacerStyle  = {backgroundColor:PANEL_BG,fontSize:'2px'};

function makeDivider(){return ui.Label('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',dividerStyle);}
function makeSpacer(){return ui.Label(' ',spacerStyle);}

// ──────────────────────────────────────────────────────────────────────
// 5b. ROBUST GRADIENT LEGEND  (continuous bar + tick marks)
// ──────────────────────────────────────────────────────────────────────
function makeGradientLegend(title, palette, min, max, unit, ticks, position) {
  position = position || 'bottom-left';
  var legend = ui.Panel({style:{
    position:position, padding:'8px 12px',
    backgroundColor:'rgba(26,26,46,0.92)', border:'1px solid #444',
    maxWidth:'320px'
  }});

  // Title
  legend.add(ui.Label(title, {
    fontWeight:'bold', fontSize:'13px', color:'#fff',
    backgroundColor:'rgba(0,0,0,0)', margin:'0 0 4px 0'
  }));

  // Gradient bar: many narrow colour segments for smooth appearance
  var nSteps = 40;
  var barRow = ui.Panel({
    layout: ui.Panel.Layout.flow('horizontal'),
    style:{backgroundColor:'rgba(0,0,0,0)', margin:'0', padding:'0'}
  });
  for (var s = 0; s < nSteps; s++) {
    var frac = s / (nSteps - 1);
    // Interpolate palette colour
    var palIdx = frac * (palette.length - 1);
    var lo = Math.floor(palIdx);
    var hi = Math.min(palette.length - 1, lo + 1);
    var t = palIdx - lo;
    var colLo = palette[lo];
    var colHi = palette[hi];
    var col = interpolateHex(colLo, colHi, t);
    barRow.add(ui.Label('', {
      backgroundColor: col,
      width: (100 / nSteps) + '%',
      height: '16px',
      margin: '0', padding: '0', border: 'none'
    }));
  }
  legend.add(barRow);

  // Tick marks row
  if (ticks && ticks.length > 0) {
    var tickRow = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style:{backgroundColor:'rgba(0,0,0,0)', margin:'0', padding:'0'}
    });
    for (var ti = 0; ti < ticks.length; ti++) {
      var tickFrac = (ticks[ti] - min) / (max - min);
      var tickPct = Math.round(tickFrac * 100);
      // Format tick value
      var tickVal = ticks[ti];
      var tickStr;
      if (Math.abs(tickVal) >= 1000) tickStr = (tickVal/1000).toFixed(1) + 'k';
      else if (tickVal % 1 !== 0) tickStr = tickVal.toFixed(1);
      else tickStr = tickVal + '';

      var w;
      if (ti === 0) {
        w = tickPct + '%';
      } else if (ti === ticks.length - 1) {
        w = (100 - tickPct) + '%';
      } else {
        var prevFrac = (ticks[ti-1] - min)/(max - min);
        var prevPct = Math.round(prevFrac * 100);
        w = (tickPct - prevPct) + '%';
      }

      var align = 'left';
      if (ti === ticks.length - 1) align = 'right';
      else if (ti > 0) align = 'center';

      tickRow.add(ui.Label(tickStr, {
        fontSize:'9px', color:'#bbb', backgroundColor:'rgba(0,0,0,0)',
        width: w, margin:'0', padding:'0', textAlign: align
      }));
    }
    legend.add(tickRow);
  }

  // Unit label
  legend.add(ui.Label(unit, {
    fontSize:'10px', color:'#999', backgroundColor:'rgba(0,0,0,0)',
    margin:'2px 0 0 0', fontStyle:'italic'
  }));

  // Health category markers (for pollutants only)
  if (pollutants[title.split(' – ')[0]]) {
    var catBar = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style:{backgroundColor:'rgba(0,0,0,0)', margin:'4px 0 0 0'}
    });
    for (var ci = 0; ci < healthCategories.length; ci++) {
      var hc = healthCategories[ci];
      var maxR = isFinite(hc.maxRatio) ? hc.maxRatio : 1.2;
      var prevR = ci > 0 ? healthCategories[ci-1].maxRatio : 0;
      var segW = Math.round((maxR - prevR) * 100 / 1.2);
      if (segW < 2) segW = 2;
      catBar.add(ui.Label(hc.icon, {
        fontSize:'9px', backgroundColor:hc.color+'33',
        width:segW+'%', height:'14px', textAlign:'center',
        margin:'0', padding:'0', border:'1px solid '+hc.color+'66'
      }));
    }
    legend.add(catBar);
  }

  return legend;
}

/** Hex colour interpolation helper */
function interpolateHex(hex1, hex2, t) {
  var r1=parseInt(hex1.slice(1,3),16), g1=parseInt(hex1.slice(3,5),16), b1=parseInt(hex1.slice(5,7),16);
  var r2=parseInt(hex2.slice(1,3),16), g2=parseInt(hex2.slice(3,5),16), b2=parseInt(hex2.slice(5,7),16);
  var r=Math.round(r1+(r2-r1)*t), g=Math.round(g1+(g2-g1)*t), b=Math.round(b1+(b2-b1)*t);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}

// ──────────────────────────────────────────────────────────────────────
// 6.  BUILD LEFT SIDEBAR
// ──────────────────────────────────────────────────────────────────────
var sidebar = ui.Panel({style:{width:'380px',backgroundColor:PANEL_BG,
  border:'1px solid '+BORDER,padding:'10px 14px'}});

sidebar.add(ui.Label('🌬️  AirWatch BD', {fontSize:'22px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG}));
sidebar.add(ui.Label('Intelligent Air Quality Monitoring  v4.0', {
  fontSize:'12px',fontStyle:'italic',color:ACCENT2,backgroundColor:PANEL_BG,margin:'2px 0 0 0'}));
sidebar.add(makeDivider());

var metaRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'2px 0'}});
metaRow.add(ui.Label('📍 Dhaka City  ',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));
metaRow.add(ui.Label('🛰️ S5P + ERA5 + CHIRPS + MODIS + VIIRS',{fontSize:'10px',color:'#999',backgroundColor:PANEL_BG}));
sidebar.add(metaRow);
sidebar.add(ui.Label('📆 Coverage: '+START_YEAR+' – '+END_YEAR,{fontSize:'11px',color:'#999',backgroundColor:PANEL_BG}));
sidebar.add(makeSpacer());

// ──────────────────────────────────────────────────────────────────────
// 6a. DATE PICKER
// ──────────────────────────────────────────────────────────────────────
sidebar.add(ui.Label('📅 Date Selection', headingStyle));

var temporalModePanel = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'2px 0'}});
var btnAnnual  = ui.Button({label:'📆 Annual', style:{backgroundColor:'#333',color:ACCENT,fontWeight:'bold',margin:'0 3px'}});
var btnMonthly = ui.Button({label:'📅 Monthly',style:{backgroundColor:'#222',color:'#888',margin:'0 3px'}});
var btnDaily   = ui.Button({label:'🗓️ Daily',  style:{backgroundColor:'#222',color:'#888',margin:'0 3px'}});
temporalModePanel.add(btnAnnual); temporalModePanel.add(btnMonthly); temporalModePanel.add(btnDaily);
sidebar.add(temporalModePanel);

var currentTemporalMode = 'Annual';

function setTemporalMode(mode) {
  currentTemporalMode = mode;
  var onS={backgroundColor:'#333',color:ACCENT,fontWeight:'bold'};
  var offS={backgroundColor:'#222',color:'#888',fontWeight:'normal'};
  btnAnnual.style().set(mode==='Annual'?onS:offS);
  btnMonthly.style().set(mode==='Monthly'?onS:offS);
  btnDaily.style().set(mode==='Daily'?onS:offS);
  monthRow.style().set('shown',mode==='Monthly'||mode==='Daily');
  dayRow.style().set('shown',mode==='Daily');
  updateDateSummary();
}

var yearRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'4px 0'}});
yearRow.add(ui.Label('Year ',{fontSize:'12px',color:'#ccc',backgroundColor:PANEL_BG,width:'50px'}));
var yearSlider = ui.Slider({min:2020,max:2025,value:2024,step:1,
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
yearSlider.onChange(function(){updateDateSummary();});
yearRow.add(yearSlider); sidebar.add(yearRow);

var monthRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'2px 0'}});
monthRow.add(ui.Label('Month',{fontSize:'12px',color:'#ccc',backgroundColor:PANEL_BG,width:'50px'}));
var monthSlider = ui.Slider({min:1,max:12,value:1,step:1,
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
monthSlider.onChange(function(){updateDateSummary();});
monthRow.add(monthSlider); sidebar.add(monthRow);

var dayRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'2px 0'}});
dayRow.add(ui.Label('Day  ',{fontSize:'12px',color:'#ccc',backgroundColor:PANEL_BG,width:'50px'}));
var daySlider = ui.Slider({min:1,max:31,value:15,step:1,
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
daySlider.onChange(function(){updateDateSummary();});
dayRow.add(daySlider); sidebar.add(dayRow);

var dateSummaryLabel = ui.Label('',{fontSize:'13px',fontWeight:'bold',color:ACCENT2,
  backgroundColor:'#111',padding:'4px 8px',margin:'4px 0',textAlign:'center',stretch:'horizontal'});
sidebar.add(dateSummaryLabel);

function updateDateSummary() {
  var y=Math.round(yearSlider.getValue()),m=Math.round(monthSlider.getValue()),d=Math.round(daySlider.getValue());
  var txt;
  if(currentTemporalMode==='Annual') txt='📆  '+y+'  (Annual Mean)';
  else if(currentTemporalMode==='Monthly') txt='📅  '+MONTH_NAMES[m-1]+' '+y+'  (Monthly Mean)';
  else txt='🗓️  '+y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d+'  (Daily)';
  dateSummaryLabel.setValue(txt);
}

btnAnnual.onClick(function(){setTemporalMode('Annual');});
btnMonthly.onClick(function(){setTemporalMode('Monthly');});
btnDaily.onClick(function(){setTemporalMode('Daily');});
setTemporalMode('Annual');

// ── Pollutant selector ──
sidebar.add(ui.Label('🧪 Select Pollutant', headingStyle));
var pollutantKeys = Object.keys(pollutants);
var pollutantSelect = ui.Select({items:pollutantKeys,value:pollutantKeys[0],
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
sidebar.add(pollutantSelect);

var whoLabel = ui.Label('',{fontSize:'10px',color:'#aaa',backgroundColor:PANEL_BG,fontStyle:'italic',margin:'2px 0'});
sidebar.add(whoLabel);
function updateWHOLabel(){whoLabel.setValue('ℹ️ '+pollutants[pollutantSelect.getValue()].who);}
pollutantSelect.onChange(function(){updateWHOLabel();});
updateWHOLabel();

// ── Supplementary layer ──
sidebar.add(ui.Label('🗺️ Supplementary Layer', headingStyle));
var suppKeys = ['None'].concat(Object.keys(supplementary));
var suppSelect = ui.Select({items:suppKeys,value:'None',
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
sidebar.add(suppSelect);
var suppDescLabel = ui.Label('',{fontSize:'10px',color:'#999',backgroundColor:PANEL_BG,fontStyle:'italic',margin:'2px 0'});
sidebar.add(suppDescLabel);
suppSelect.onChange(function(val){
  suppDescLabel.setValue(val!=='None'?'  → '+supplementary[val].description:'');
});

// ──────────────────────────────────────────────────────────────────────
// 6a-ii. THANA / UNION ADMIN SELECTOR (cascading)
// ──────────────────────────────────────────────────────────────────────
sidebar.add(makeDivider());
sidebar.add(ui.Label('🏛️ Admin Selection (Thana / Union)', headingStyle));
sidebar.add(ui.Label('Select a thana (upazila) or union/ward to clip\nanalysis. Use "Run Area Analysis" for full report.',mutedStyle));

// Admin level radio
var adminLevelPanel = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'4px 0'}});
var btnFullAOI = ui.Button({label:'Full AOI',style:{backgroundColor:'#333',color:ACCENT,fontWeight:'bold',margin:'0 3px',fontSize:'11px'}});
var btnThana   = ui.Button({label:'Thana',   style:{backgroundColor:'#222',color:'#888',margin:'0 3px',fontSize:'11px'}});
var btnUnion   = ui.Button({label:'Union',   style:{backgroundColor:'#222',color:'#888',margin:'0 3px',fontSize:'11px'}});
adminLevelPanel.add(btnFullAOI); adminLevelPanel.add(btnThana); adminLevelPanel.add(btnUnion);
sidebar.add(adminLevelPanel);

var currentAdminLevel = 'Full';

// Thana selector
var thanaSelectPanel = ui.Panel({style:{backgroundColor:PANEL_BG,margin:'2px 0',shown:false}});
thanaSelectPanel.add(ui.Label('Thana/Upazila:',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));
var thanaSelect = ui.Select({items:['Loading...'],value:'Loading...',
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
thanaSelectPanel.add(thanaSelect);
sidebar.add(thanaSelectPanel);

// Union selector
var unionSelectPanel = ui.Panel({style:{backgroundColor:PANEL_BG,margin:'2px 0',shown:false}});
unionSelectPanel.add(ui.Label('Union:',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));
var unionSelect = ui.Select({items:['Select thana first'],value:'Select thana first',
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
unionSelectPanel.add(unionSelect);
sidebar.add(unionSelectPanel);

var adminInfoLabel = ui.Label('📍 Analysis area: Dhaka City (Full)',{
  fontSize:'11px',fontWeight:'bold',color:ACCENT2,backgroundColor:'#111',
  padding:'4px 8px',margin:'4px 0',stretch:'horizontal'});
sidebar.add(adminInfoLabel);

// Populate thana dropdown from ADM3_EN field
adm3_dhaka.aggregate_array('ADM3_EN').evaluate(function(names){
  if(!names||names.length===0) {thanaSelect.items().reset(['No data']);return;}
  var unique = names.filter(function(v,i,a){return v && a.indexOf(v)===i;}).sort();
  thanaSelect.items().reset(unique);
  thanaSelect.setValue(unique[0]);
});

function setAdminLevel(level) {
  currentAdminLevel = level;
  var onS={backgroundColor:'#333',color:ACCENT,fontWeight:'bold'};
  var offS={backgroundColor:'#222',color:'#888',fontWeight:'normal'};
  btnFullAOI.style().set(level==='Full'?onS:offS);
  btnThana.style().set(level==='Thana'?onS:offS);
  btnUnion.style().set(level==='Union'?onS:offS);
  thanaSelectPanel.style().set('shown',level==='Thana'||level==='Union');
  unionSelectPanel.style().set('shown',level==='Union');

  if(level==='Full') {
    currentSubAdminGeom = aoiGeom;
    currentSubAdminLabel = 'Dhaka City (Full)';
    adminInfoLabel.setValue('📍 Analysis area: Dhaka City (Full)');
    mapPanel.setCenter(90.40, 23.78, 11);
    updateMap();
  }
}

btnFullAOI.onClick(function(){setAdminLevel('Full');});
btnThana.onClick(function(){setAdminLevel('Thana');});
btnUnion.onClick(function(){setAdminLevel('Union');});

// When thana selection changes
thanaSelect.onChange(function(thanaNm){
  var filtered = adm3_dhaka.filter(ee.Filter.eq('ADM3_EN', thanaNm));
  currentSubAdminLabel = thanaNm + ' (Upazila)';
  adminInfoLabel.setValue('📍 ' + currentSubAdminLabel);

  // Auto-update map to clip & zoom
  updateMap();

  // Populate union dropdown if in Union mode
  if(currentAdminLevel==='Union'){
    var thanaGeom = filtered.geometry();
    var unions = adm4_dhaka.filterBounds(thanaGeom);
    unions.aggregate_array('ADM4_EN').evaluate(function(uNames){
      if(!uNames||uNames.length===0){unionSelect.items().reset(['No unions found']);return;}
      var unique = uNames.filter(function(v,i,a){return v && a.indexOf(v)===i;}).sort();
      unionSelect.items().reset(unique);
      unionSelect.setValue(unique[0]);
    });
  }
});

// When union selection changes
unionSelect.onChange(function(unionNm){
  currentSubAdminLabel = unionNm + ' (Union/Ward)';
  adminInfoLabel.setValue('📍 ' + currentSubAdminLabel);

  // Auto-update map to clip & zoom
  updateMap();
});

// ──────────────────────────────────────────────────────────────────────
// 6a-iii. INDUSTRY / POLLUTION SOURCE LAYER CONTROLS
// ──────────────────────────────────────────────────────────────────────
sidebar.add(makeDivider());
sidebar.add(ui.Label('🏭 Pollution Sources', headingStyle));
sidebar.add(ui.Label('Toggle industry, power plants, brick kilns & thermal hotspots.',mutedStyle));

var showIndustryPoints = false;
var showPowerPlants    = false;
var showFireHotspots   = false;
var showAdminBounds    = false;

var industryBtnPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});

var btnShowIndustry = ui.Button({label:'🏭 Known Industries',
  style:{stretch:'horizontal',color:'#999',backgroundColor:'#222',margin:'2px 0',fontSize:'11px'}});
var btnShowPower = ui.Button({label:'⚡ Power Plants (WRI)',
  style:{stretch:'horizontal',color:'#999',backgroundColor:'#222',margin:'2px 0',fontSize:'11px'}});
var btnShowFires = ui.Button({label:'🔥 Thermal Hotspots (VIIRS)',
  style:{stretch:'horizontal',color:'#999',backgroundColor:'#222',margin:'2px 0',fontSize:'11px'}});
var btnShowAdmin = ui.Button({label:'🗺️ Show Admin Boundaries',
  style:{stretch:'horizontal',color:'#999',backgroundColor:'#222',margin:'2px 0',fontSize:'11px'}});

industryBtnPanel.add(btnShowIndustry);
industryBtnPanel.add(btnShowPower);
industryBtnPanel.add(btnShowFires);
industryBtnPanel.add(btnShowAdmin);
sidebar.add(industryBtnPanel);

var industryInfoLabel = ui.Label('',{fontSize:'10px',color:'#999',backgroundColor:PANEL_BG,fontStyle:'italic',margin:'2px 0'});
sidebar.add(industryInfoLabel);

function toggleLayerStyle(btn, stateRef, label) {
  var isOn = !stateRef;
  btn.style().set(isOn ? {color:ACCENT,backgroundColor:'#333',fontWeight:'bold'} :
    {color:'#999',backgroundColor:'#222',fontWeight:'normal'});
  return isOn;
}

btnShowIndustry.onClick(function(){
  showIndustryPoints = toggleLayerStyle(btnShowIndustry, showIndustryPoints);
  refreshIndustryLayers();
});
btnShowPower.onClick(function(){
  showPowerPlants = toggleLayerStyle(btnShowPower, showPowerPlants);
  refreshIndustryLayers();
});
btnShowFires.onClick(function(){
  showFireHotspots = toggleLayerStyle(btnShowFires, showFireHotspots);
  refreshIndustryLayers();
});
btnShowAdmin.onClick(function(){
  showAdminBounds = toggleLayerStyle(btnShowAdmin, showAdminBounds);
  refreshIndustryLayers();
});

var industryLegend = null;  // track legend widget on map

function refreshIndustryLayers() {
  // Remove existing industry/admin overlay layers by name prefix
  var prefixes = ['🏭','⚡','🔥','🗺️ Thana','🗺️ Union','🧱','🧪','🚢','🗑️','💊'];
  var keepRemoving = true;
  while(keepRemoving) {
    keepRemoving = false;
    for (var li = mapPanel.layers().length() - 1; li >= 0; li--) {
      var nm = mapPanel.layers().get(li).getName();
      for (var pi = 0; pi < prefixes.length; pi++) {
        if (nm.indexOf(prefixes[pi]) === 0) {
          mapPanel.layers().remove(mapPanel.layers().get(li));
          keepRemoving = true;
          break;
        }
      }
      if (keepRemoving) break;
    }
  }

  // Remove old industry legend
  if (industryLegend) { try{mapPanel.remove(industryLegend);}catch(e){} industryLegend = null; }

  var anyActive = showIndustryPoints || showPowerPlants || showFireHotspots || showAdminBounds;

  if (showIndustryPoints) {
    // Colour-code by industry type using separate filtered FCs
    var typeStyles = [
      {filter: 'Garment/Textile',   color: '#ff6b6b', shape: 'diamond',  label: '🏭 Garment/Textile'},
      {filter: 'Mixed Industry',    color: '#ff4444', shape: 'diamond',  label: '🏭 Mixed Industry'},
      {filter: 'Tannery/Chemical',  color: '#ab47bc', shape: 'triangle', label: '🧪 Tannery/Chemical'},
      {filter: 'Export Processing',  color: '#ff8a65', shape: 'diamond',  label: '🏭 Export Processing'},
      {filter: 'Jute/Textile',      color: '#ef5350', shape: 'diamond',  label: '🏭 Jute/Textile'},
      {filter: 'Light Industry',    color: '#e57373', shape: 'diamond',  label: '🏭 Light Industry'},
      {filter: 'Power Plant',       color: '#ffd600', shape: 'star5',    label: '⚡ Power Plant'},
      {filter: 'Brick Kiln',        color: '#ff6d00', shape: 'square',   label: '🧱 Brick Kiln'},
      {filter: 'Waste/Landfill',    color: '#8d6e63', shape: 'circle',   label: '🗑️ Waste/Landfill'},
      {filter: 'Shipyard/Dockyard', color: '#5c6bc0', shape: 'triangle', label: '🚢 Shipyard'},
      {filter: 'Pharmaceutical',    color: '#66bb6a', shape: 'circle',   label: '💊 Pharmaceutical'},
      {filter: 'Transport/Logistics',color:'#90a4ae', shape: 'square',   label: '🚛 Transport'}
    ];

    for (var ti = 0; ti < typeStyles.length; ti++) {
      var ts = typeStyles[ti];
      var subset = knownIndustry.filter(ee.Filter.stringContains('type', ts.filter));
      mapPanel.addLayer(
        subset.style({color: ts.color, pointSize: 7, pointShape: ts.shape, width: 2}),
        {}, ts.label, true
      );
    }
  }

  if (showPowerPlants) {
    mapPanel.addLayer(
      powerPlants.style({color:'#ffd600',pointSize:9,pointShape:'star5',width:2}),
      {}, '⚡ WRI Power Plants', true);
  }

  if (showFireHotspots) {
    mapPanel.addLayer(persistentFire,
      {palette:['#ff4500'],min:1,max:1},
      '🔥 Persistent Thermal Hotspots', true, 0.7);
  }

  if (showAdminBounds) {
    mapPanel.addLayer(
      ee.Image().byte().paint(adm3_dhaka, 0, 1.5),
      {palette:['#ffff00']}, '🗺️ Thana Boundaries', true, 0.6);
    mapPanel.addLayer(
      ee.Image().byte().paint(adm4_dhaka, 0, 0.8),
      {palette:['#ff66ff']}, '🗺️ Union Boundaries', true, 0.4);
  }

  // ── Build industry legend panel ──
  if (anyActive) {
    industryLegend = ui.Panel({style:{
      position:'bottom-right', padding:'8px 10px',
      backgroundColor:'rgba(26,26,46,0.92)', border:'1px solid #444',
      maxWidth:'200px'
    }});
    industryLegend.add(ui.Label('🏭 Pollution Sources',{
      fontSize:'13px',fontWeight:'bold',color:'#ff6b6b',
      backgroundColor:'rgba(0,0,0,0)',margin:'0 0 4px 0'}));

    var legendItems = [];
    if (showIndustryPoints) {
      legendItems.push({color:'#ff6b6b',shape:'◆',label:'Garment/Textile'});
      legendItems.push({color:'#ff4444',shape:'◆',label:'Mixed Industry'});
      legendItems.push({color:'#ab47bc',shape:'▲',label:'Tannery/Chemical'});
      legendItems.push({color:'#ff8a65',shape:'◆',label:'Export Processing'});
      legendItems.push({color:'#ffd600',shape:'★',label:'Power Plant'});
      legendItems.push({color:'#ff6d00',shape:'■',label:'Brick Kiln'});
      legendItems.push({color:'#8d6e63',shape:'●',label:'Waste/Landfill'});
      legendItems.push({color:'#5c6bc0',shape:'▲',label:'Shipyard/Dock'});
      legendItems.push({color:'#66bb6a',shape:'●',label:'Pharmaceutical'});
      legendItems.push({color:'#90a4ae',shape:'■',label:'Transport/Depot'});
    }
    if (showPowerPlants) {
      legendItems.push({color:'#ffd600',shape:'★',label:'WRI Power Plants'});
    }
    if (showFireHotspots) {
      legendItems.push({color:'#ff4500',shape:'■',label:'VIIRS Thermal Hotspot'});
    }
    if (showAdminBounds) {
      legendItems.push({color:'#ffff00',shape:'—',label:'Upazila Boundary'});
      legendItems.push({color:'#ff66ff',shape:'—',label:'Union Boundary'});
    }

    for (var lgi = 0; lgi < legendItems.length; lgi++) {
      var li2 = legendItems[lgi];
      var legRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
        style:{backgroundColor:'rgba(0,0,0,0)',margin:'1px 0'}});
      legRow.add(ui.Label(li2.shape, {
        fontSize:'12px', color:li2.color,
        backgroundColor:'rgba(0,0,0,0)', width:'16px',
        margin:'0', fontWeight:'bold'
      }));
      legRow.add(ui.Label(li2.label, {
        fontSize:'10px', color:'#ccc',
        backgroundColor:'rgba(0,0,0,0)', margin:'0 0 0 4px'
      }));
      industryLegend.add(legRow);
    }

    industryLegend.add(ui.Label(legendItems.length + ' categories shown',{
      fontSize:'9px',color:'#777',backgroundColor:'rgba(0,0,0,0)',
      fontStyle:'italic',margin:'4px 0 0 0'}));

    mapPanel.add(industryLegend);
    industryInfoLabel.setValue(anyActive ? 'Layers active — see map legend (bottom-right)' : '');
  } else {
    industryInfoLabel.setValue('');
  }
}

// ──────────────────────────────────────────────────────────────────────
// 6b. ACTION BUTTONS
// ──────────────────────────────────────────────────────────────────────
sidebar.add(makeDivider());
sidebar.add(ui.Label('⚡ Actions', headingStyle));

var updateBtn = ui.Button({label:'🔄  Update Map & Chart',
  style:{stretch:'horizontal',color:'#000',backgroundColor:ACCENT,fontWeight:'bold',margin:'6px 0 3px 0'}});
sidebar.add(updateBtn);

var vulnBtn = ui.Button({label:'🛡️  Vulnerability Assessment',
  style:{stretch:'horizontal',color:'#000',backgroundColor:ACCENT2,fontWeight:'bold',margin:'3px 0'}});
sidebar.add(vulnBtn);

var aqiBtn = ui.Button({label:'🌡️  Composite AQI Map',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ff6b9d',fontWeight:'bold',margin:'3px 0'}});
sidebar.add(aqiBtn);

var allYearsBtn = ui.Button({label:'📊  Multi-Year Comparison',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ffaa00',fontWeight:'bold',margin:'3px 0'}});
sidebar.add(allYearsBtn);

var seasonBtn = ui.Button({label:'🌦️  Dry vs Wet Season',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#80cbc4',fontWeight:'bold',margin:'3px 0'}});
sidebar.add(seasonBtn);

var anomalyBtn = ui.Button({label:'📉  Anomaly Detection',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ce93d8',fontWeight:'bold',margin:'3px 0'}});
sidebar.add(anomalyBtn);

var yoyBtn = ui.Button({label:'📈  Year-on-Year % Change',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ffcc80',fontWeight:'bold',margin:'3px 0'}});
sidebar.add(yoyBtn);

// ── Admin-specific deep analysis ──
sidebar.add(makeDivider());
sidebar.add(ui.Label('🏛️ Admin Area Analysis', headingStyle));
sidebar.add(ui.Label('Full pollutant report for the selected\nUpazila or Union/Ward vs whole Dhaka City.',mutedStyle));

var adminAnalysisBtn = ui.Button({label:'🏛️  Run Area Analysis',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#26c6da',fontWeight:'bold',margin:'6px 0 3px 0'}});
sidebar.add(adminAnalysisBtn);

var adminAnalysisPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
sidebar.add(adminAnalysisPanel);

// ── Admin Analysis Logic ──
adminAnalysisBtn.onClick(function(){
  var year = getSelectedYear();
  var areaGeom = getAnalysisGeom();
  var areaLabel = currentSubAdminLabel;

  adminAnalysisPanel.clear();
  if(currentAdminLevel === 'Full'){
    adminAnalysisPanel.add(ui.Label('⚠️ Select a Thana or Union first — this analysis\ncompares a sub-area against the full AOI.',
      {fontSize:'12px',color:'#ffaa00',backgroundColor:PANEL_BG}));
    return;
  }

  adminAnalysisPanel.add(ui.Label('⏳ Analysing '+areaLabel+' ('+year+') …',mutedStyle));
  adminAnalysisPanel.add(ui.Label('  Computing all 7 pollutants + vulnerability …',mutedStyle));

  // ── Query all pollutants for SELECTED area AND full AOI in parallel ──
  var areaResults = pollutantKeys.map(function(k){
    return annualMean(k,year).reduceRegion({
      reducer:ee.Reducer.mean(),geometry:areaGeom,
      scale:5000,maxPixels:1e9
    }).get(pollutants[k].band);
  });
  var aoiResults = pollutantKeys.map(function(k){
    return annualMean(k,year).reduceRegion({
      reducer:ee.Reducer.mean(),geometry:aoiGeom,
      scale:5000,maxPixels:1e9
    }).get(pollutants[k].band);
  });

  // ── Vulnerability for area ──
  var vulnArea = computeVulnerability(year).reduceRegion({
    reducer:ee.Reducer.mean().combine(ee.Reducer.minMax(),null,true),
    geometry:areaGeom,scale:1000,maxPixels:1e9
  });
  var vulnAOI = computeVulnerability(year).reduceRegion({
    reducer:ee.Reducer.mean(),geometry:aoiGeom,scale:1000,maxPixels:1e9
  });

  // ── Count industry points in area ──
  var industryInArea = knownIndustry.filterBounds(areaGeom);
  var powerInArea = powerPlants.filterBounds(areaGeom);

  // ── Evaluate everything ──
  ee.List(areaResults).evaluate(function(aVals){
    ee.List(aoiResults).evaluate(function(dVals){
      vulnArea.evaluate(function(vArea){
        vulnAOI.evaluate(function(vAOI){
          industryInArea.size().evaluate(function(indCount){
            powerInArea.size().evaluate(function(ppCount){

    adminAnalysisPanel.clear();

    // ════════════════════════════════════════════
    // HEADER
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(ui.Label('🏛️ '+areaLabel+'  |  '+year, {
      fontSize:'15px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG,margin:'6px 0 2px 0'}));
    adminAnalysisPanel.add(makeDivider());

    // ════════════════════════════════════════════
    // POLLUTANT TABLE: Area vs Dhaka
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(ui.Label('📊 Pollutant Comparison — Area vs Dhaka City',subHeadStyle));

    // Header row
    var tblHdr = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
      style:{backgroundColor:'#111',padding:'3px 4px',margin:'2px 0',border:'1px solid #333'}});
    tblHdr.add(ui.Label('Pollutant',{fontSize:'10px',fontWeight:'bold',color:'#aaa',backgroundColor:'#111',width:'70px'}));
    tblHdr.add(ui.Label(areaLabel.split(' (')[0],{fontSize:'10px',fontWeight:'bold',color:ACCENT,backgroundColor:'#111',width:'70px',textAlign:'right'}));
    tblHdr.add(ui.Label('Dhaka',{fontSize:'10px',fontWeight:'bold',color:'#ccc',backgroundColor:'#111',width:'55px',textAlign:'right'}));
    tblHdr.add(ui.Label('Diff %',{fontSize:'10px',fontWeight:'bold',color:'#ffa726',backgroundColor:'#111',width:'50px',textAlign:'right'}));
    tblHdr.add(ui.Label('Status',{fontSize:'10px',fontWeight:'bold',color:'#ccc',backgroundColor:'#111',width:'35px',textAlign:'center'}));
    adminAnalysisPanel.add(tblHdr);

    var chartFeatures = [];
    var valDictArea = {};

    for (var i=0; i<pollutantKeys.length; i++){
      var pk = pollutants[pollutantKeys[i]];
      var aV = (aVals && aVals[i]!=null) ? Number(aVals[i]) : null;
      var dV = (dVals && dVals[i]!=null) ? Number(dVals[i]) : null;
      if(aV!==null && isNaN(aV)) aV = null;
      if(dV!==null && isNaN(dV)) dV = null;

      var aStr = aV!==null ? aV.toFixed(2) : 'N/A';
      var dStr = dV!==null ? dV.toFixed(2) : 'N/A';
      var diffPct = (aV!==null && dV!==null && dV!==0) ? ((aV-dV)/Math.abs(dV)*100) : null;
      var diffStr = diffPct!==null ? (diffPct>0?'+':'')+diffPct.toFixed(1)+'%' : '—';
      var diffCol = diffPct!==null ? (diffPct>5?'#ff5252': diffPct<-5?'#69f0ae':'#fff') : '#777';

      var cat = getHealthCategory(pollutantKeys[i], aV);
      var statusIcon = cat ? cat.icon : '⚪';

      if(aV!==null) valDictArea[pollutantKeys[i]] = aV;

      var tblRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
        style:{backgroundColor:(i%2===0)?'#151525':'#111',padding:'2px 4px',margin:'0'}});
      tblRow.add(ui.Label(pollutantKeys[i].split(' (')[0],{fontSize:'10px',color:'#ccc',backgroundColor:'rgba(0,0,0,0)',width:'70px'}));
      tblRow.add(ui.Label(aStr,{fontSize:'10px',color:ACCENT,backgroundColor:'rgba(0,0,0,0)',width:'70px',textAlign:'right',fontWeight:'bold'}));
      tblRow.add(ui.Label(dStr,{fontSize:'10px',color:'#999',backgroundColor:'rgba(0,0,0,0)',width:'55px',textAlign:'right'}));
      tblRow.add(ui.Label(diffStr,{fontSize:'10px',color:diffCol,backgroundColor:'rgba(0,0,0,0)',width:'50px',textAlign:'right',fontWeight:'bold'}));
      tblRow.add(ui.Label(statusIcon,{fontSize:'12px',backgroundColor:'rgba(0,0,0,0)',width:'35px',textAlign:'center'}));
      adminAnalysisPanel.add(tblRow);

      // Collect for chart
      if(aV!==null && dV!==null){
        chartFeatures.push(ee.Feature(null,{
          pollutant: pollutantKeys[i].split(' (')[0],
          area: Math.max(0,(aV-pk.visMin)/(pk.visMax-pk.visMin)),
          dhaka: Math.max(0,(dV-pk.visMin)/(pk.visMax-pk.visMin))
        }));
      }
    }

    // ── Grouped bar chart: Area vs Dhaka (normalised) ──
    if(chartFeatures.length>0){
      adminAnalysisPanel.add(makeSpacer());
      var compFC = ee.FeatureCollection(chartFeatures);
      adminAnalysisPanel.add(ui.Chart.feature.byFeature(compFC,'pollutant',['area','dhaka'])
        .setChartType('BarChart')
        .setOptions({
          title:'Normalised Concentration — '+areaLabel.split(' (')[0]+' vs Dhaka',
          titleTextStyle:{color:'#ccc',fontSize:11},
          hAxis:{title:'Normalised (0–1)',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},minValue:0,maxValue:1},
          vAxis:{textStyle:{color:'#aaa',fontSize:9}},
          colors:[ACCENT,'#666'], bar:{groupWidth:'75%'},
          backgroundColor:'#111',legend:{position:'bottom',textStyle:{color:'#aaa',fontSize:10}},
          chartArea:{backgroundColor:'#111'}
        }));
    }

    // ════════════════════════════════════════════
    // VULNERABILITY
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(makeDivider());
    adminAnalysisPanel.add(ui.Label('🛡️ Vulnerability Index',subHeadStyle));

    var vAreaMean = (vArea && vArea.vulnerability_mean!=null) ? Number(vArea.vulnerability_mean) : null;
    var vAreaMin  = (vArea && vArea.vulnerability_min!=null) ? Number(vArea.vulnerability_min) : null;
    var vAreaMax  = (vArea && vArea.vulnerability_max!=null) ? Number(vArea.vulnerability_max) : null;
    var vAOIMean  = (vAOI && vAOI.vulnerability_mean!=null) ? Number(vAOI.vulnerability_mean) : null;

    var fv = function(v){return (v!==null && !isNaN(v)) ? v.toFixed(3) : 'N/A';};
    adminAnalysisPanel.add(ui.Label('  '+areaLabel+' — Mean: '+fv(vAreaMean)+
      '  Min: '+fv(vAreaMin)+'  Max: '+fv(vAreaMax),labelStyle));
    adminAnalysisPanel.add(ui.Label('  Dhaka City — Mean: '+fv(vAOIMean),{fontSize:'12px',color:'#999',backgroundColor:PANEL_BG}));

    if(vAreaMean!==null && vAOIMean!==null && vAOIMean!==0 && !isNaN(vAreaMean) && !isNaN(vAOIMean)){
      var vDiff = ((vAreaMean-vAOIMean)/Math.abs(vAOIMean)*100);
      var vDir = vDiff>0 ? '▲ Higher' : '▼ Lower';
      var vCol = vDiff>0 ? '#ff5252' : '#69f0ae';
      adminAnalysisPanel.add(ui.Label('  '+vDir+' by '+Math.abs(vDiff).toFixed(1)+'% than city average',
        {fontSize:'12px',fontWeight:'bold',color:vCol,backgroundColor:PANEL_BG}));
    }

    // Vulnerability gauge bar
    if(vAreaMean!==null){
      var gaugeW = Math.max(2,Math.min(100,Math.round(vAreaMean*100)));
      var gaugePal = ['#1a9850','#91cf60','#d9ef8b','#fee08b','#fc8d59','#d73027'];
      var gaugeIdx = Math.min(5,Math.floor(vAreaMean*6));
      var gaugeCol = gaugePal[gaugeIdx];
      var gaugeRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
        style:{backgroundColor:'#222',margin:'4px 0',border:'1px solid #333'}});
      gaugeRow.add(ui.Label('',{backgroundColor:gaugeCol,width:gaugeW+'%',height:'14px',margin:'0',padding:'0'}));
      gaugeRow.add(ui.Label('',{backgroundColor:'#222',width:(100-gaugeW)+'%',height:'14px',margin:'0',padding:'0'}));
      adminAnalysisPanel.add(gaugeRow);
      var gaugeLabel = vAreaMean<0.3 ? 'LOW' : vAreaMean<0.5 ? 'MODERATE' : vAreaMean<0.7 ? 'HIGH' : 'VERY HIGH';
      adminAnalysisPanel.add(ui.Label('  Vulnerability: '+gaugeLabel+' ('+fv(vAreaMean)+')',
        {fontSize:'11px',fontWeight:'bold',color:gaugeCol,backgroundColor:PANEL_BG}));
    }

    // ════════════════════════════════════════════
    // INDUSTRY EXPOSURE
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(makeDivider());
    adminAnalysisPanel.add(ui.Label('🏭 Pollution Source Exposure',subHeadStyle));
    adminAnalysisPanel.add(ui.Label('  Known industrial sites in area: '+(indCount||0),labelStyle));
    adminAnalysisPanel.add(ui.Label('  Power plants in area: '+(ppCount||0),labelStyle));

    if(indCount>0){
      industryInArea.aggregate_array('name').evaluate(function(names){
        if(names && names.length>0){
          for(var ni=0; ni<names.length; ni++){
            industryInArea.filter(ee.Filter.eq('name',names[ni])).first().evaluate(function(f){
              if(f && f.properties){
                adminAnalysisPanel.add(ui.Label(
                  '    • '+f.properties.name+' ('+f.properties.type+')',
                  {fontSize:'10px',color:'#ffab40',backgroundColor:PANEL_BG}));
              }
            });
          }
        }
      });
    }

    if(ppCount>0){
      powerInArea.aggregate_array('name').evaluate(function(ppNames){
        if(ppNames && ppNames.length>0){
          for(var pni=0; pni<Math.min(ppNames.length,10); pni++){
            adminAnalysisPanel.add(ui.Label('    ⚡ '+ppNames[pni],
              {fontSize:'10px',color:'#ffd600',backgroundColor:PANEL_BG}));
          }
        }
      });
    }

    // ════════════════════════════════════════════
    // HEALTH ADVISORY (push to right panel)
    // ════════════════════════════════════════════
    if(Object.keys(valDictArea).length > 0){
      showAdvisories(valDictArea, areaLabel + ' | ' + year);
    }

    // ════════════════════════════════════════════
    // MONTHLY TREND FOR THIS AREA
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(makeDivider());
    adminAnalysisPanel.add(ui.Label('📈 Monthly Trend ('+pollutantSelect.getValue().split(' (')[0]+') in '+areaLabel.split(' (')[0],subHeadStyle));

    var trendKey = pollutantSelect.getValue();
    var trendP = pollutants[trendKey];
    var months12 = ee.List.sequence(0,11);
    var areaMonthFC = ee.FeatureCollection(months12.map(function(m){
      m = ee.Number(m);
      var s = ee.Date(year+'-01-01').advance(m,'month');
      var vA = ee.ImageCollection(trendP.collection)
        .filterDate(s,s.advance(1,'month')).filterBounds(aoiGeom)
        .select(trendP.band).mean().multiply(trendP.scale)
        .reduceRegion({reducer:ee.Reducer.mean(),geometry:areaGeom,scale:5000,maxPixels:1e9}).get(trendP.band);
      var vD = ee.ImageCollection(trendP.collection)
        .filterDate(s,s.advance(1,'month')).filterBounds(aoiGeom)
        .select(trendP.band).mean().multiply(trendP.scale)
        .reduceRegion({reducer:ee.Reducer.mean(),geometry:aoiGeom,scale:5000,maxPixels:1e9}).get(trendP.band);
      return ee.Feature(null,{month:m.add(1),area:vA,dhaka:vD});
    }));

    areaMonthFC.evaluate(function(fc2){
      if(!fc2||!fc2.features||fc2.features.length===0) return;
      adminAnalysisPanel.add(ui.Chart.feature.byFeature(
        ee.FeatureCollection(areaMonthFC),'month',['area','dhaka'])
        .setChartType('LineChart')
        .setOptions({
          title:trendKey.split(' (')[0]+' — '+areaLabel.split(' (')[0]+' vs Dhaka ('+year+')',
          titleTextStyle:{color:'#ccc',fontSize:11},
          hAxis:{title:'Month',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          vAxis:{title:trendP.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          lineWidth:2,pointSize:4,
          colors:[ACCENT,'#666'],curveType:'function',
          backgroundColor:'#111',legend:{position:'bottom',textStyle:{color:'#aaa',fontSize:10}},
          chartArea:{backgroundColor:'#111'}
        }));
    });

    // ════════════════════════════════════════════
    // MULTI-YEAR TREND FOR THIS AREA
    // ════════════════════════════════════════════
    adminAnalysisPanel.add(ui.Label('📊 Multi-Year Trend ('+trendKey.split(' (')[0]+') in '+areaLabel.split(' (')[0],subHeadStyle));

    var areaYearFC = ee.FeatureCollection(ee.List.sequence(START_YEAR,END_YEAR).map(function(y){
      y = ee.Number(y);
      var vA = annualMean(trendKey,y).reduceRegion({
        reducer:ee.Reducer.mean(),geometry:areaGeom,scale:5000,maxPixels:1e9
      }).get(trendP.band);
      var vD = annualMean(trendKey,y).reduceRegion({
        reducer:ee.Reducer.mean(),geometry:aoiGeom,scale:5000,maxPixels:1e9
      }).get(trendP.band);
      return ee.Feature(null,{year:y,area:vA,dhaka:vD});
    }));

    areaYearFC.evaluate(function(fc3){
      if(!fc3||!fc3.features||fc3.features.length===0) return;
      adminAnalysisPanel.add(ui.Chart.feature.byFeature(
        ee.FeatureCollection(areaYearFC),'year',['area','dhaka'])
        .setChartType('ColumnChart')
        .setOptions({
          title:trendKey.split(' (')[0]+' Annual — '+areaLabel.split(' (')[0]+' vs Dhaka',
          titleTextStyle:{color:'#ccc',fontSize:11},
          hAxis:{title:'Year',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},format:'####'},
          vAxis:{title:trendP.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          colors:[ACCENT,'#666'], bar:{groupWidth:'70%'},
          backgroundColor:'#111',legend:{position:'bottom',textStyle:{color:'#aaa',fontSize:10}},
          chartArea:{backgroundColor:'#111'}
        }));
    });

            });  // powerInArea.size
          });  // industryInArea.size
        });  // vulnAOI
      });  // vulnArea
    });  // aoiResults
  });  // areaResults
});

// ── Split-panel comparison button ──
sidebar.add(makeDivider());
sidebar.add(ui.Label('🔀 Split-Panel Comparison', headingStyle));

sidebar.add(ui.Label('Compare two pollutants or years side-by-side.',mutedStyle));

var splitPollSelect = ui.Select({items:pollutantKeys,value:pollutantKeys[1],
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
sidebar.add(ui.Label('Right-side pollutant:',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));
sidebar.add(splitPollSelect);

var splitYearSlider = ui.Slider({min:2020,max:2025,value:2023,step:1,
  style:{stretch:'horizontal',backgroundColor:'#111',color:TEXT_PRIMARY}});
sidebar.add(ui.Label('Right-side year:',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));
sidebar.add(splitYearSlider);

var splitBtn = ui.Button({label:'🔀  Enter Split View',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ab47bc',fontWeight:'bold',margin:'6px 0 3px 0'}});
sidebar.add(splitBtn);

var exitSplitBtn = ui.Button({label:'✖  Exit Split View',
  style:{stretch:'horizontal',color:'#ccc',backgroundColor:'#333',margin:'3px 0'}});
sidebar.add(exitSplitBtn);
exitSplitBtn.style().set('shown', false);

// ── Multi-layer overlay ──
sidebar.add(makeDivider());
sidebar.add(ui.Label('📚 Multi-Layer Overlay', headingStyle));
sidebar.add(ui.Label('Toggle additional pollutant layers on the main map.', mutedStyle));

var overlayChecks = {};
var overlayPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
pollutantKeys.forEach(function(k){
  var btn = ui.Button({label:'  '+k.split(' (')[0],
    style:{stretch:'horizontal',color:'#999',backgroundColor:'#222',margin:'1px 0',fontSize:'11px'}});
  var isOn = false;
  btn.onClick(function(){
    isOn = !isOn;
    btn.style().set(isOn ? {color:ACCENT,backgroundColor:'#333',fontWeight:'bold'} :
      {color:'#999',backgroundColor:'#222',fontWeight:'normal'});
    updateOverlayLayers();
  });
  overlayChecks[k] = {button:btn, active:function(){return isOn;}};
  overlayPanel.add(btn);
});
sidebar.add(overlayPanel);

function updateOverlayLayers() {
  var year = getSelectedYear();
  // Remove old overlay layers (keep boundary + primary + supp)
  var baseCount = 1; // boundary
  // just rebuild: remove all, re-add what's needed via updateMap
  updateMap();
  // Then add overlay layers
  pollutantKeys.forEach(function(k){
    if (overlayChecks[k].active() && k !== pollutantSelect.getValue()) {
      var p = pollutants[k];
      var img = annualMean(k, year);
      mapPanel.addLayer(img, {min:p.visMin,max:p.visMax,palette:p.palette},
        '📚 '+k.split(' (')[0], true, 0.4);
    }
  });
}

// ── Export ──
sidebar.add(makeDivider());
var exportBtn = ui.Button({label:'💾  Export Current Layer (GeoTIFF)',
  style:{stretch:'horizontal',color:'#ccc',backgroundColor:'#333',fontWeight:'bold',margin:'4px 0'}});
sidebar.add(exportBtn);

// ── Chart panel ──
sidebar.add(ui.Label('📈 Trend Analysis', headingStyle));
var chartPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
sidebar.add(chartPanel);

// ── Correlation heatmap ──
sidebar.add(ui.Label('🔥 Correlation Heatmap', headingStyle));
var heatmapPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
sidebar.add(heatmapPanel);
var corrBtn = ui.Button({label:'📐  Compute Correlations',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ff79c6',fontWeight:'bold',margin:'4px 0'}});
sidebar.add(corrBtn);

// ── Drawing tools ──
sidebar.add(ui.Label('✏️ Draw & Inspect', headingStyle));
sidebar.add(ui.Label('Draw point / rect / polygon, then inspect.',mutedStyle));
var inspectDrawnBtn = ui.Button({label:'🔍  Inspect Drawn Geometry',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#e066ff',fontWeight:'bold',margin:'4px 0'}});
sidebar.add(inspectDrawnBtn);
var clearDrawBtn = ui.Button({label:'🗑️  Clear Drawings',
  style:{stretch:'horizontal',color:'#ccc',backgroundColor:'#333',margin:'2px 0'}});
sidebar.add(clearDrawBtn);

// ── Inspector & stats ──
sidebar.add(ui.Label('🔍 Location Inspector', headingStyle));
sidebar.add(ui.Label('Click map or draw to query',mutedStyle));
var inspectorPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
sidebar.add(inspectorPanel);
sidebar.add(ui.Label('📋 Summary Statistics', headingStyle));
var statsPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
sidebar.add(statsPanel);

// ── Credits ──
sidebar.add(makeDivider());
sidebar.add(ui.Label('© 2025 AirWatch BD v4.2',{fontSize:'10px',color:TEXT_MUTED,backgroundColor:PANEL_BG,textAlign:'center'}));
sidebar.add(ui.Label('Sentinel-5P • ERA5 • CHIRPS • MODIS • VIIRS • WorldPop',{fontSize:'9px',color:'#666',backgroundColor:PANEL_BG,textAlign:'center'}));

// ──────────────────────────────────────────────────────────────────────
// 6c. RIGHT PANEL (fixed position, non-draggable)
// ──────────────────────────────────────────────────────────────────────
var advisoryPanel = ui.Panel({style:{
  width:'330px', backgroundColor:PANEL_BG,
  border:'1px solid '+BORDER, padding:'10px 12px'
}});

advisoryPanel.add(ui.Label('🏥 Health Advisory',{fontSize:'18px',fontWeight:'bold',color:'#ff6b6b',backgroundColor:PANEL_BG}));
advisoryPanel.add(ui.Label('Click map or inspect drawn area for\nhealth advisories.',mutedStyle));
advisoryPanel.add(makeSpacer());

advisoryPanel.add(ui.Label('Air Quality Categories',subHeadStyle));
for (var ci=0; ci<healthCategories.length; ci++){
  var hc = healthCategories[ci];
  var catRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'1px 0'}});
  catRow.add(ui.Label(hc.icon+' '+hc.label,{fontSize:'11px',color:hc.color,backgroundColor:PANEL_BG,fontWeight:'bold',width:'160px'}));
  var pctLabel = (ci===healthCategories.length-1) ? '>'+Math.round(healthCategories[ci-1].maxRatio*100)+'%'
    : '≤'+Math.round(hc.maxRatio*100)+'%';
  catRow.add(ui.Label(pctLabel,{fontSize:'10px',color:'#aaa',backgroundColor:PANEL_BG}));
  advisoryPanel.add(catRow);
}
advisoryPanel.add(makeSpacer());
advisoryPanel.add(makeDivider());

// Dynamic advisory content
var advisoryContentPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
advisoryPanel.add(advisoryContentPanel);

// ── Pollutant Percentage Breakdown section (always visible at bottom) ──
advisoryPanel.add(makeDivider());
advisoryPanel.add(ui.Label('📊 Pollutant % Breakdown',{
  fontSize:'15px',fontWeight:'bold',color:'#ffa726',backgroundColor:PANEL_BG,margin:'8px 0 4px 0'}));
advisoryPanel.add(ui.Label('Annual mean for selected year — click\n"Compute %" to populate.',mutedStyle));

var pctBreakdownPanel = ui.Panel({style:{backgroundColor:PANEL_BG}});
advisoryPanel.add(pctBreakdownPanel);

var computePctBtn = ui.Button({label:'📊  Compute Pollutant %',
  style:{stretch:'horizontal',color:'#000',backgroundColor:'#ffa726',fontWeight:'bold',margin:'6px 0'}});
advisoryPanel.add(computePctBtn);

// ── Vulnerable groups (bottom of right panel) ──
advisoryPanel.add(makeDivider());
advisoryPanel.add(ui.Label('👶👴🤰 Vulnerable Groups',subHeadStyle));
advisoryPanel.add(ui.Label('• Children under 14\n• Adults over 65\n• Pregnant women\n• Asthma & COPD patients\n• Outdoor workers',{fontSize:'11px',color:'#ccc',backgroundColor:PANEL_BG}));

// ──────────────────────────────────────────────────────────────────────
// 6d. showAdvisories
// ──────────────────────────────────────────────────────────────────────
function showAdvisories(valuesDict, locLabel) {
  advisoryContentPanel.clear();
  advisoryContentPanel.add(ui.Label('📌 '+locLabel,{fontSize:'13px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG,margin:'6px 0 4px 0'}));

  var keys=Object.keys(valuesDict);
  var worstIdx=-1, worstRatio=-1;
  var donutFeatures=[], donutColors=[], totalNorm=0;

  for(var i=0;i<keys.length;i++){
    var k=keys[i],v=valuesDict[k];
    var cat=getHealthCategory(k,v);
    if(!cat) continue;
    var p=pollutants[k];
    var ratio=Math.max(0,(v-p.visMin)/(p.visMax-p.visMin));
    if(ratio>worstRatio){worstRatio=ratio;worstIdx=i;}
    totalNorm+=ratio;
    donutFeatures.push(ee.Feature(null,{pollutant:k.split(' (')[0],ratio:ratio}));
    donutColors.push(cat.color);
  }

  if(donutFeatures.length>0){
    var donutFC=ee.FeatureCollection(donutFeatures);
    advisoryContentPanel.add(ui.Chart.feature.byFeature(donutFC,'pollutant','ratio')
      .setChartType('PieChart')
      .setOptions({
        title:'Pollutant Contribution',titleTextStyle:{color:'#ccc',fontSize:12},
        pieHole:0.45,
        slices:(function(){var s={};for(var si=0;si<donutColors.length;si++){s[si]={color:donutColors[si]};}return s;})(),
        backgroundColor:'#111',legend:{position:'labeled',textStyle:{color:'#aaa',fontSize:10}},
        chartArea:{backgroundColor:'#111'},pieSliceTextStyle:{color:'#fff',fontSize:10},is3D:false
      }));
  }

  advisoryContentPanel.add(makeDivider());

  for(var j=0;j<keys.length;j++){
    var kk=keys[j],vv=valuesDict[kk];
    var ccat=getHealthCategory(kk,vv);
    if(!ccat) continue;
    var pp=pollutants[kk];
    var pctVal=totalNorm>0?(Math.max(0,(vv-pp.visMin)/(pp.visMax-pp.visMin))/totalNorm*100).toFixed(1):'0';
    var row=ui.Panel({style:{backgroundColor:'#111',padding:'4px 6px',margin:'2px 0',border:'1px solid #222'}});
    var hdr=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:'#111'}});
    hdr.add(ui.Label(ccat.icon,{fontSize:'14px',backgroundColor:'#111',margin:'0 4px 0 0'}));
    hdr.add(ui.Label(kk.split(' (')[0],{fontSize:'11px',fontWeight:'bold',color:ccat.color,backgroundColor:'#111'}));
    hdr.add(ui.Label('  '+vv.toFixed(2)+' '+pp.unit+'  ('+pctVal+'%)',{fontSize:'11px',color:'#ccc',backgroundColor:'#111'}));
    row.add(hdr);
    var barRatio=Math.min(1,Math.max(0,(vv-pp.visMin)/(pp.visMax-pp.visMin)));
    var barW=Math.max(4,Math.round(barRatio*100));
    var barRow2=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:'#111',margin:'2px 0 0 0'}});
    barRow2.add(ui.Label('',{backgroundColor:ccat.color,width:barW+'%',height:'6px',margin:'0',padding:'0'}));
    barRow2.add(ui.Label('',{backgroundColor:'#222',width:(100-barW)+'%',height:'6px',margin:'0',padding:'0'}));
    row.add(barRow2);
    row.add(ui.Label(ccat.label,{fontSize:'10px',color:ccat.color,backgroundColor:'#111',fontWeight:'bold'}));
    advisoryContentPanel.add(row);
  }

  if(worstIdx>=0){
    var worstKey=keys[worstIdx];
    var worstCat=getHealthCategory(worstKey,valuesDict[worstKey]);
    if(worstCat){
      advisoryContentPanel.add(makeSpacer());
      var advBox=ui.Panel({style:{backgroundColor:WARN_BG,padding:'8px',margin:'4px 0',border:'2px solid '+worstCat.color}});
      advBox.add(ui.Label(worstCat.icon+'  OVERALL: '+worstCat.label.toUpperCase(),
        {fontSize:'14px',fontWeight:'bold',color:worstCat.color,backgroundColor:WARN_BG}));
      advBox.add(makeSpacer());
      advBox.add(ui.Label('⚠️ Advisory',{fontSize:'12px',fontWeight:'bold',color:'#ff9',backgroundColor:WARN_BG}));
      advBox.add(ui.Label(worstCat.advice,{fontSize:'11px',color:'#ddd',backgroundColor:WARN_BG}));
      advBox.add(makeSpacer());
      advBox.add(ui.Label('🏥 Health Impact',{fontSize:'12px',fontWeight:'bold',color:'#ff9',backgroundColor:WARN_BG}));
      advBox.add(ui.Label(worstCat.health,{fontSize:'11px',color:'#ddd',backgroundColor:WARN_BG}));
      advBox.add(makeSpacer());
      advBox.add(ui.Label('📋 Guidelines',{fontSize:'12px',fontWeight:'bold',color:'#ff9',backgroundColor:WARN_BG}));
      advBox.add(ui.Label(worstCat.guideline,{fontSize:'11px',color:'#ddd',backgroundColor:WARN_BG}));
      advisoryContentPanel.add(advBox);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 6e. POLLUTANT PERCENTAGE COMPUTATION
// ──────────────────────────────────────────────────────────────────────
computePctBtn.onClick(function(){
  var year = getSelectedYear();
  pctBreakdownPanel.clear();
  pctBreakdownPanel.add(ui.Label('⏳ Computing for '+year+' …',mutedStyle));

  var results = pollutantKeys.map(function(k){
    var pk = pollutants[k];
    return annualMean(k,year).reduceRegion({
      reducer:ee.Reducer.mean(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9
    }).get(pk.band);
  });

  ee.List(results).evaluate(function(vals){
    pctBreakdownPanel.clear();
    if(!vals){pctBreakdownPanel.add(ui.Label('Failed.',mutedStyle));return;}

    pctBreakdownPanel.add(ui.Label('📊 Dhaka City — '+year+' Annual Mean',{
      fontSize:'12px',fontWeight:'bold',color:'#ffa726',backgroundColor:PANEL_BG,margin:'4px 0'}));

    // Compute normalised ratios
    var ratios=[], totalR=0;
    for(var i=0;i<pollutantKeys.length;i++){
      var pk=pollutants[pollutantKeys[i]];
      var v=(vals[i]!==null&&vals[i]!==undefined)?vals[i]:0;
      var r=Math.max(0,(v-pk.visMin)/(pk.visMax-pk.visMin));
      ratios.push(r);
      totalR+=r;
    }

    // Stacked horizontal bar (proportional)
    var stackRow = ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
      style:{backgroundColor:'#111',margin:'4px 0',border:'1px solid #333'}});
    for(var j=0;j<pollutantKeys.length;j++){
      var pct2 = totalR>0 ? (ratios[j]/totalR)*100 : 0;
      if(pct2<1) continue; // skip tiny slivers
      var cat2=getHealthCategory(pollutantKeys[j],vals[j]);
      var col2=cat2?cat2.color:'#555';
      stackRow.add(ui.Label('',{
        backgroundColor:col2,width:Math.max(1,Math.round(pct2))+'%',
        height:'20px',margin:'0',padding:'0'
      }));
    }
    pctBreakdownPanel.add(stackRow);

    // Detailed rows
    for(var rr=0;rr<pollutantKeys.length;rr++){
      var pk2=pollutants[pollutantKeys[rr]];
      var v2=(vals[rr]!==null&&vals[rr]!==undefined)?vals[rr]:0;
      var pctR=totalR>0?(ratios[rr]/totalR*100).toFixed(1):'0.0';
      var cat3=getHealthCategory(pollutantKeys[rr],v2);
      var icon3=cat3?cat3.icon:'⚪';
      var col3=cat3?cat3.color:'#888';

      var pRow=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
        style:{backgroundColor:PANEL_BG,margin:'1px 0'}});
      pRow.add(ui.Label(icon3,{fontSize:'12px',backgroundColor:PANEL_BG,margin:'0 3px 0 0'}));
      pRow.add(ui.Label(pollutantKeys[rr].split(' (')[0],{
        fontSize:'11px',color:col3,backgroundColor:PANEL_BG,fontWeight:'bold',width:'80px'}));
      pRow.add(ui.Label(v2.toFixed(2)+' '+pk2.unit,{
        fontSize:'10px',color:'#ccc',backgroundColor:PANEL_BG,width:'100px'}));

      // Mini bar
      var miniW=Math.max(2,Math.round(parseFloat(pctR)));
      var miniBar=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),
        style:{backgroundColor:PANEL_BG,width:'60px',margin:'0'}});
      miniBar.add(ui.Label('',{backgroundColor:col3,width:miniW+'%',height:'10px',margin:'0',padding:'0'}));
      miniBar.add(ui.Label('',{backgroundColor:'#222',width:(100-miniW)+'%',height:'10px',margin:'0',padding:'0'}));
      pRow.add(miniBar);

      pRow.add(ui.Label(pctR+'%',{fontSize:'11px',color:'#fff',backgroundColor:PANEL_BG,fontWeight:'bold',margin:'0 0 0 4px'}));
      pctBreakdownPanel.add(pRow);
    }

    // Bar chart
    var chartFeatures = [];
    for(var cc=0;cc<pollutantKeys.length;cc++){
      var pctC=totalR>0?(ratios[cc]/totalR*100):0;
      chartFeatures.push(ee.Feature(null,{
        pollutant:pollutantKeys[cc].split(' (')[0],
        percentage:pctC
      }));
    }
    var pctFC = ee.FeatureCollection(chartFeatures);
    pctBreakdownPanel.add(ui.Chart.feature.byFeature(pctFC,'pollutant','percentage')
      .setChartType('BarChart')
      .setOptions({
        title:'Relative Contribution (% of normalised total)',
        titleTextStyle:{color:'#ccc',fontSize:11},
        hAxis:{title:'%',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},minValue:0},
        vAxis:{textStyle:{color:'#aaa',fontSize:10}},
        colors:['#ffa726'],bar:{groupWidth:'70%'},
        backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
      }));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 7.  MAP SETUP
// ──────────────────────────────────────────────────────────────────────
var mapPanel = ui.Map();
mapPanel.setCenter(90.40, 23.78, 11);
mapPanel.setOptions('SATELLITE');
mapPanel.style().set({backgroundColor:'#0a0a14'});

// Second map for split view
var mapPanel2 = ui.Map();
mapPanel2.setCenter(90.40, 23.78, 11);
mapPanel2.setOptions('SATELLITE');
mapPanel2.style().set({backgroundColor:'#0a0a14'});

// Track state
var inSplitMode = false;
var currentLegend = null;
var currentLegend2 = null;
var currentExportImg = null;

// Boundary on both maps
mapPanel.addLayer(ee.Image().byte().paint(dhaka,0,2),{palette:[ACCENT]},'🟦 Dhaka Boundary',true);
mapPanel2.addLayer(ee.Image().byte().paint(dhaka,0,2),{palette:[ACCENT]},'🟦 Dhaka Boundary',true);

// Drawing tools
var drawingTools = mapPanel.drawingTools();
drawingTools.setShown(true);
drawingTools.setLinked(false);
drawingTools.addLayer([],'Inspector Drawings','#ff00ff');
drawingTools.setShape('point');

var trendlineOpts = {0:{type:'linear',color:'#ff5555',lineWidth:2,opacity:0.7,showR2:true,visibleInLegend:true}};

// ──────────────────────────────────────────────────────────────────────
// 8.  MAIN UPDATE LOGIC
// ──────────────────────────────────────────────────────────────────────
function getSelectedYear(){return Math.round(yearSlider.getValue());}
function getSelectedMonth(){return Math.round(monthSlider.getValue());}
function getSelectedDay(){return Math.round(daySlider.getValue());}

/** Returns the server-side FeatureCollection for the selected admin unit */
function getSelectedAdminFC() {
  if(currentAdminLevel === 'Union') {
    return adm4_dhaka.filter(ee.Filter.eq('ADM4_EN', unionSelect.getValue()));
  } else if(currentAdminLevel === 'Thana') {
    return adm3_dhaka.filter(ee.Filter.eq('ADM3_EN', thanaSelect.getValue()));
  }
  return dhaka;  // Full AOI
}

/** Returns server-side geometry for analysis — always fresh from the FC */
function getAnalysisGeom() {
  return getSelectedAdminFC().geometry();
}
function getDateStr(){
  var y=getSelectedYear(),m=getSelectedMonth(),d=getSelectedDay();
  return y+'-'+(m<10?'0':'')+m+'-'+(d<10?'0':'')+d;
}

function addLayerToMap(map, img, p, layerLabel, legendRef) {
  map.addLayer(img,{min:p.visMin,max:p.visMax,palette:p.palette},layerLabel,true,0.85);
  var legend = makeGradientLegend(layerLabel, p.palette, p.visMin, p.visMax, p.unit, p.ticks, 'bottom-left');
  if (legendRef && legendRef.current) map.remove(legendRef.current);
  map.add(legend);
  return legend;
}

function updateMap() {
  var mode=currentTemporalMode;
  var year=getSelectedYear();
  var key=pollutantSelect.getValue();
  var p=pollutants[key];

  while(mapPanel.layers().length()>1) mapPanel.layers().remove(mapPanel.layers().get(1));
  if(currentLegend) {try{mapPanel.remove(currentLegend);}catch(e){}}

  var img,layerLabel;
  if(mode==='Monthly'){
    var mv=getSelectedMonth();
    img=monthlyMeanImage(key,year,mv);
    layerLabel=key+' – '+MONTH_NAMES[mv-1]+' '+year;
  } else if(mode==='Daily'){
    var ds=getDateStr();
    img=dailyMeanImage(key,ds);
    layerLabel=key+' – '+ds;
  } else {
    img=annualMean(key,year);
    layerLabel=key+' – '+year;
  }

  // ── Clip to selected admin area & add both full + clipped layers ──
  if(currentAdminLevel !== 'Full') {
    var adminFC = getSelectedAdminFC();
    var adminGeomEE = adminFC.geometry();

    // Full AOI layer (dimmed)
    mapPanel.addLayer(img,{min:p.visMin,max:p.visMax,palette:p.palette},
      layerLabel+' (Dhaka)', false, 0.3);

    // Clipped layer (bright, primary)
    var clippedImg = img.clip(adminGeomEE);
    mapPanel.addLayer(clippedImg,{min:p.visMin,max:p.visMax,palette:p.palette},
      layerLabel+' — '+currentSubAdminLabel, true, 0.9);
    currentExportImg = clippedImg;

    // Admin boundary highlight
    mapPanel.addLayer(
      ee.Image().byte().paint(adminFC, 0, 3),
      {palette:['#00ffff']}, '📍 '+currentSubAdminLabel, true);

    // Zoom to selected area
    adminGeomEE.evaluate(function(g){
      if(g) mapPanel.centerObject(ee.Geometry(g), 13);
    });

    layerLabel = layerLabel+' — '+currentSubAdminLabel;
  } else {
    mapPanel.addLayer(img,{min:p.visMin,max:p.visMax,palette:p.palette},layerLabel,true,0.85);
    currentExportImg = img;
  }

  currentLegend = makeGradientLegend(layerLabel,p.palette,p.visMin,p.visMax,p.unit,p.ticks,'bottom-left');
  mapPanel.add(currentLegend);

  // Supplementary
  var suppKey=suppSelect.getValue();
  if(suppKey!=='None'){
    var supp=supplementary[suppKey];
    var suppImg=supp.getImage(year);
    mapPanel.addLayer(suppImg,{min:supp.visMin,max:supp.visMax,palette:supp.palette},
      '🗺️ '+suppKey,true,0.5);
  }

  // Charts
  chartPanel.clear();
  chartPanel.add(ui.Label('⏳ Loading chart …',mutedStyle));

  // Keep reference to unclipped image for stats (avoid double-clip)
  var statsImg = img;

  if(mode==='Daily'){
    var selDate=ee.Date(getDateStr());
    var dailyCol=ee.ImageCollection(p.collection)
      .filterDate(selDate.advance(-15,'day'),selDate.advance(15,'day'))
      .filterBounds(aoiGeom).select(p.band);
    chartPanel.clear();
    chartPanel.add(ui.Chart.image.series(dailyCol,getAnalysisGeom(),ee.Reducer.mean(),5000)
      .setChartType('LineChart')
      .setOptions({
        title:key+' Daily (±15d) — '+currentSubAdminLabel,
        hAxis:{title:'Date',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
        vAxis:{title:p.unit+' (raw)',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
        lineWidth:2,pointSize:3,colors:['#ff6b6b'],trendlines:trendlineOpts,
        backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
      }));
  } else if(mode==='Monthly'){
    var analysisG = getAnalysisGeom();
    var months12=ee.List.sequence(0,11);
    var monthFC=months12.map(function(m){
      m=ee.Number(m);
      var s=ee.Date(year+'-01-01').advance(m,'month');
      var v=ee.ImageCollection(p.collection)
        .filterDate(s,s.advance(1,'month')).filterBounds(aoiGeom)
        .select(p.band).mean().multiply(p.scale)
        .reduceRegion({reducer:ee.Reducer.mean(),geometry:analysisG,scale:5000,maxPixels:1e9}).get(p.band);
      return ee.Feature(null,{month:m.add(1),value:v});
    });
    var mFC=ee.FeatureCollection(monthFC);
    mFC.evaluate(function(fc){
      chartPanel.clear();
      if(!fc||!fc.features){chartPanel.add(ui.Label('No data available.',mutedStyle));return;}
      // Filter out null-value features
      var valid = fc.features.filter(function(f){return f.properties.value!==null&&f.properties.value!==undefined;});
      if(valid.length===0){chartPanel.add(ui.Label('No valid data for this area/period.',mutedStyle));return;}
      // Build server-side FC from valid features only
      var validFC = ee.FeatureCollection(valid.map(function(f){
        return ee.Feature(null,{month:f.properties.month,value:f.properties.value});
      }));
      chartPanel.add(ui.Chart.feature.byFeature(validFC,'month','value')
        .setChartType('ColumnChart')
        .setOptions({
          title:key+' Monthly ('+year+') — '+currentSubAdminLabel,
          hAxis:{title:'Month',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          vAxis:{title:p.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          colors:['#ffa502'],trendlines:trendlineOpts,
          backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
        }));
    });
  } else {
    var ts=monthlyTimeSeries(key);
    ts.evaluate(function(fc){
      chartPanel.clear();
      if(!fc||!fc.features){chartPanel.add(ui.Label('No data available.',mutedStyle));return;}
      var valid = fc.features.filter(function(f){return f.properties.value!==null&&f.properties.value!==undefined;});
      if(valid.length===0){chartPanel.add(ui.Label('No valid data for this area/period.',mutedStyle));return;}
      var validFC = ee.FeatureCollection(valid.map(function(f){
        return ee.Feature(null,{date:f.properties.date,value:f.properties.value});
      }));
      chartPanel.add(ui.Chart.feature.byFeature(validFC,'date','value')
        .setChartType('LineChart')
        .setOptions({
          title:key+' Monthly Mean ('+START_YEAR+'–'+END_YEAR+') — '+currentSubAdminLabel,
          hAxis:{title:'Date',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          vAxis:{title:p.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
          lineWidth:2,pointSize:3,colors:[ACCENT],trendlines:trendlineOpts,
          backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
        }));
    });
  }

  // Stats — use unclipped image reduced over analysis geometry
  statsPanel.clear();
  statsPanel.add(ui.Label('⏳ Computing stats …',mutedStyle));
  statsImg.reduceRegion({
    reducer:ee.Reducer.mean().combine(ee.Reducer.minMax(),null,true)
      .combine(ee.Reducer.stdDev(),null,true)
      .combine(ee.Reducer.percentile([10,25,50,75,90]),null,true),
    geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9
  }).evaluate(function(stats){
    statsPanel.clear();
    if(!stats){statsPanel.add(ui.Label('Stats unavailable',mutedStyle));return;}
    var b=p.band;
    var f=function(v){return v!==null&&v!==undefined?v.toFixed(2):'N/A';};
    statsPanel.add(ui.Label(mode+': '+layerLabel,labelStyle));
    statsPanel.add(ui.Label('  Area: '+currentSubAdminLabel,{fontSize:'11px',color:ACCENT2,backgroundColor:PANEL_BG,fontStyle:'italic'}));
    statsPanel.add(ui.Label('  Mean  : '+f(stats[b+'_mean'])+' '+p.unit,labelStyle));
    statsPanel.add(ui.Label('  Median: '+f(stats[b+'_p50'])+' '+p.unit,labelStyle));
    statsPanel.add(ui.Label('  Min   : '+f(stats[b+'_min'])+' '+p.unit,labelStyle));
    statsPanel.add(ui.Label('  Max   : '+f(stats[b+'_max'])+' '+p.unit,labelStyle));
    statsPanel.add(ui.Label('  StDev : '+f(stats[b+'_stdDev'])+' '+p.unit,labelStyle));
    statsPanel.add(ui.Label('  P10/P90: '+f(stats[b+'_p10'])+' / '+f(stats[b+'_p90'])+' '+p.unit,mutedStyle));
  });
}

// ──────────────────────────────────────────────────────────────────────
// 9. VULNERABILITY
// ──────────────────────────────────────────────────────────────────────
vulnBtn.onClick(function(){
  while(mapPanel.layers().length()>1) mapPanel.layers().remove(mapPanel.layers().get(1));
  if(currentLegend) {try{mapPanel.remove(currentLegend);}catch(e){}}
  var selYear=getSelectedYear();
  var vi=computeVulnerability(selYear);
  var vp=['#1a9850','#91cf60','#d9ef8b','#fee08b','#fc8d59','#d73027'];
  mapPanel.addLayer(vi,{min:0,max:1,palette:vp},'🛡️ Vulnerability ('+selYear+')',true,0.85);
  currentExportImg=vi;
  currentLegend=makeGradientLegend('Vulnerability ('+selYear+')',vp,0,1,'(0=Low  1=High)',
    [0,0.2,0.4,0.6,0.8,1.0],'bottom-left');
  mapPanel.add(currentLegend);
  chartPanel.clear();
  chartPanel.add(ui.Label('Vulnerability ('+selYear+') — 12 Factors:',{fontSize:'12px',fontWeight:'bold',color:ACCENT2,backgroundColor:PANEL_BG}));
  chartPanel.add(ui.Label('NO₂ 15% | SO₂ 7% | CO 7% | Aerosol 10% | CH₄ 3%\nPop 15% | LST 10% | Green 8% | NTL 8% | Precip 7% | Wind 5%',mutedStyle));
  statsPanel.clear();
  vi.reduceRegion({
    reducer:ee.Reducer.mean().combine(ee.Reducer.minMax(),null,true)
      .combine(ee.Reducer.percentile([25,50,75]),null,true),
    geometry:getAnalysisGeom(),scale:1000,maxPixels:1e9
  }).evaluate(function(s){
    statsPanel.clear();
    var f=function(v){return v!==null&&v!==undefined?v.toFixed(3):'N/A';};
    statsPanel.add(ui.Label('Vulnerability ('+selYear+')',labelStyle));
    statsPanel.add(ui.Label('  Mean  : '+f(s.vulnerability_mean),labelStyle));
    statsPanel.add(ui.Label('  Median: '+f(s.vulnerability_p50),labelStyle));
    statsPanel.add(ui.Label('  Min   : '+f(s.vulnerability_min),labelStyle));
    statsPanel.add(ui.Label('  Max   : '+f(s.vulnerability_max),labelStyle));
    statsPanel.add(ui.Label('  IQR   : '+f(s.vulnerability_p25)+' – '+f(s.vulnerability_p75),mutedStyle));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 9b. COMPOSITE AQI
// ──────────────────────────────────────────────────────────────────────
aqiBtn.onClick(function(){
  while(mapPanel.layers().length()>1) mapPanel.layers().remove(mapPanel.layers().get(1));
  if(currentLegend) {try{mapPanel.remove(currentLegend);}catch(e){}}
  var yr=getSelectedYear();
  var aqi=computeCompositeAQI(yr);
  var aqiPal=['#00e400','#92d050','#ffff00','#ff7e00','#ff0000','#7e0023','#4c0000'];
  mapPanel.addLayer(aqi,{min:0,max:1,palette:aqiPal},'🌡️ Composite AQI ('+yr+')',true,0.85);
  currentExportImg=aqi;
  currentLegend=makeGradientLegend('Composite AQI ('+yr+')',aqiPal,0,1,'(0=Clean  1=Severe)',
    [0,0.2,0.4,0.6,0.8,1.0],'bottom-left');
  mapPanel.add(currentLegend);
  chartPanel.clear();
  chartPanel.add(ui.Label('Composite AQI ('+yr+'):',{fontSize:'12px',fontWeight:'bold',color:'#ff6b9d',backgroundColor:PANEL_BG}));
  chartPanel.add(ui.Label('NO₂ 25% | Aerosol 25% | CO 15% | SO₂ 15% | O₃ 10% | HCHO 10%',mutedStyle));
});

// ──────────────────────────────────────────────────────────────────────
// 10. MULTI-YEAR COMPARISON
// ──────────────────────────────────────────────────────────────────────
allYearsBtn.onClick(function(){
  var key=pollutantSelect.getValue(),p=pollutants[key];
  chartPanel.clear();
  chartPanel.add(ui.Label('⏳ Building multi-year comparison …',mutedStyle));
  var yrs=ee.List.sequence(START_YEAR,END_YEAR);
  var aFC=ee.FeatureCollection(yrs.map(function(y){
    y=ee.Number(y);
    var v=annualMean(key,y).reduceRegion({reducer:ee.Reducer.mean(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9}).get(p.band);
    return ee.Feature(null,{year:y,value:v});
  }));
  aFC.evaluate(function(fc){
    chartPanel.clear();
    if(!fc||!fc.features||fc.features.length===0){chartPanel.add(ui.Label('No data.',mutedStyle));return;}
    chartPanel.add(ui.Chart.feature.byFeature(aFC,'year','value').setChartType('ColumnChart').setOptions({
      title:key+' Annual Mean ('+START_YEAR+'–'+END_YEAR+')',
      hAxis:{title:'Year',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},format:'####'},
      vAxis:{title:p.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
      colors:[ACCENT2],trendlines:trendlineOpts,backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
    }));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10b. SEASONAL
// ──────────────────────────────────────────────────────────────────────
seasonBtn.onClick(function(){
  var key=pollutantSelect.getValue(),p=pollutants[key];
  chartPanel.clear();
  chartPanel.add(ui.Label('⏳ Computing seasonal comparison …',mutedStyle));
  var yrs=ee.List.sequence(START_YEAR,END_YEAR);
  var seasonFC=ee.FeatureCollection(yrs.map(function(y){
    y=ee.Number(y);
    var dryMonthList=ee.List([11,12,1,2,3]);
    var dryImgList=dryMonthList.map(function(m){
      m=ee.Number(m);
      var adjY=ee.Algorithms.If(m.gte(11),y.subtract(1),y);
      var s=ee.Date.fromYMD(ee.Number(adjY),m,1);
      return ee.ImageCollection(p.collection)
        .filterDate(s,s.advance(1,'month')).filterBounds(aoiGeom)
        .select(p.band).mean();
    });
    var dryVal=ee.ImageCollection.fromImages(dryImgList).mean().multiply(p.scale)
      .reduceRegion({reducer:ee.Reducer.mean(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9}).get(p.band);
    var wetMonthList=ee.List([4,5,6,7,8,9,10]);
    var wetImgList=wetMonthList.map(function(m){
      m=ee.Number(m);
      var s=ee.Date.fromYMD(y,m,1);
      return ee.ImageCollection(p.collection)
        .filterDate(s,s.advance(1,'month')).filterBounds(aoiGeom)
        .select(p.band).mean();
    });
    var wetVal=ee.ImageCollection.fromImages(wetImgList).mean().multiply(p.scale)
      .reduceRegion({reducer:ee.Reducer.mean(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9}).get(p.band);
    return ee.Feature(null,{year:y,dry:dryVal,wet:wetVal});
  }));
  seasonFC.evaluate(function(fc){
    chartPanel.clear();
    if(!fc||!fc.features||fc.features.length===0){chartPanel.add(ui.Label('No data.',mutedStyle));return;}
    chartPanel.add(ui.Chart.feature.byFeature(seasonFC,'year',['dry','wet']).setChartType('ColumnChart').setOptions({
      title:key+' – Dry (Nov–Mar) vs Wet (Apr–Oct)',
      hAxis:{title:'Year',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},format:'####'},
      vAxis:{title:p.unit,textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
      colors:['#ff7043','#42a5f5'],isStacked:false,
      backgroundColor:'#111',legend:{position:'bottom',textStyle:{color:'#aaa'}},chartArea:{backgroundColor:'#111'}
    }));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10c. ANOMALY
// ──────────────────────────────────────────────────────────────────────
anomalyBtn.onClick(function(){
  var key=pollutantSelect.getValue(),p=pollutants[key];
  chartPanel.clear();
  chartPanel.add(ui.Label('⏳ Computing anomalies …',mutedStyle));
  var anomTS=computeAnomalyTS(key);
  anomTS.evaluate(function(fc){
    chartPanel.clear();
    if(!fc||!fc.features||fc.features.length===0){chartPanel.add(ui.Label('No data.',mutedStyle));return;}
    chartPanel.add(ui.Chart.feature.byFeature(anomTS,'date','anomaly').setChartType('ColumnChart').setOptions({
      title:key+' – Monthly Anomaly from Climatology',
      hAxis:{title:'Date',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'}},
      vAxis:{title:'Anomaly ('+p.unit+')',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},baseline:0},
      colors:['#ce93d8'],backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
    }));
    chartPanel.add(ui.Label('Positive = above long-term monthly avg; Negative = below',{fontSize:'10px',color:'#999',backgroundColor:PANEL_BG,fontStyle:'italic'}));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10d. YoY % CHANGE
// ──────────────────────────────────────────────────────────────────────
yoyBtn.onClick(function(){
  var key=pollutantSelect.getValue(),p=pollutants[key];
  chartPanel.clear();
  chartPanel.add(ui.Label('⏳ Computing YoY change …',mutedStyle));
  var yrs=ee.List.sequence(START_YEAR,END_YEAR);
  var valList=yrs.map(function(y){
    y=ee.Number(y);
    return annualMean(key,y).reduceRegion({reducer:ee.Reducer.mean(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9}).get(p.band);
  });
  ee.List(valList).evaluate(function(vals){
    chartPanel.clear();
    if(!vals||vals.length<2){chartPanel.add(ui.Label('Insufficient data.',mutedStyle));return;}
    var features=[];
    for(var i=1;i<vals.length;i++){
      if(vals[i]!==null&&vals[i-1]!==null&&vals[i-1]!==0){
        features.push(ee.Feature(null,{year:START_YEAR+i,pctChange:((vals[i]-vals[i-1])/Math.abs(vals[i-1]))*100}));
      }
    }
    if(features.length===0){chartPanel.add(ui.Label('No valid pairs.',mutedStyle));return;}
    var yoyFC=ee.FeatureCollection(features);
    chartPanel.add(ui.Chart.feature.byFeature(yoyFC,'year','pctChange').setChartType('ColumnChart').setOptions({
      title:key+' – Year-on-Year % Change',
      hAxis:{title:'Year',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},format:'####'},
      vAxis:{title:'% Change',textStyle:{color:'#aaa'},titleTextStyle:{color:'#ccc'},gridlines:{color:'#333'},baseline:0},
      colors:['#ffcc80'],backgroundColor:'#111',legend:{position:'none'},chartArea:{backgroundColor:'#111'}
    }));
    var lastChange=((vals[vals.length-1]-vals[vals.length-2])/Math.abs(vals[vals.length-2])*100);
    var dir=lastChange>0?'📈 Increased':'📉 Decreased';
    var cDir=lastChange>0?'#ff6b6b':'#00e400';
    chartPanel.add(ui.Label(dir+' by '+Math.abs(lastChange).toFixed(1)+'% ('+( END_YEAR-1)+' → '+END_YEAR+')',
      {fontSize:'12px',fontWeight:'bold',color:cDir,backgroundColor:PANEL_BG}));
  });
});

// ──────────────────────────────────────────────────────────────────────
// 10e. EXPORT
// ──────────────────────────────────────────────────────────────────────
exportBtn.onClick(function(){
  if(!currentExportImg){
    statsPanel.clear();statsPanel.add(ui.Label('⚠️ No layer to export.',{fontSize:'12px',color:'#ffaa00',backgroundColor:PANEL_BG}));return;
  }
  var key=pollutantSelect.getValue(),year=getSelectedYear();
  var desc=key.replace(/[^a-zA-Z0-9]/g,'_')+'_'+year+'_Dhaka';
  Export.image.toDrive({image:currentExportImg,description:desc,folder:'AirWatch_BD',
    region:aoiGeom,scale:1000,maxPixels:1e9,crs:'EPSG:4326'});
  statsPanel.clear();
  statsPanel.add(ui.Label('✅ Export: "'+desc+'" — check Tasks tab.',{fontSize:'12px',color:ACCENT2,backgroundColor:PANEL_BG}));
});

// ──────────────────────────────────────────────────────────────────────
// 11. MAP CLICK INSPECTOR
// ──────────────────────────────────────────────────────────────────────
function inspectGeometry(geom,locLabel){
  var year=getSelectedYear();
  inspectorPanel.clear();
  inspectorPanel.add(ui.Label('📌  '+locLabel,{fontSize:'12px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG}));
  inspectorPanel.add(ui.Label('⏳ Querying all pollutants …',mutedStyle));
  var results=pollutantKeys.map(function(k){
    var pk=pollutants[k];
    return annualMean(k,year).reduceRegion({reducer:ee.Reducer.mean(),geometry:geom,scale:1000,maxPixels:1e9}).get(pk.band);
  });
  ee.List(results).evaluate(function(vals){
    inspectorPanel.clear();
    inspectorPanel.add(ui.Label('📌  '+locLabel,{fontSize:'12px',fontWeight:'bold',color:ACCENT,backgroundColor:PANEL_BG}));
    inspectorPanel.add(ui.Label('Year: '+year,labelStyle));
    var valDict={};
    for(var i=0;i<pollutantKeys.length;i++){
      var pk=pollutants[pollutantKeys[i]];
      var v=(vals[i]!==null&&vals[i]!==undefined)?vals[i]:null;
      var vStr=v!==null?v.toFixed(2):'N/A';
      var cat=getHealthCategory(pollutantKeys[i],v);
      var catIcon=cat?cat.icon:'⚪';
      inspectorPanel.add(ui.Label('  '+catIcon+' '+pollutantKeys[i]+': '+vStr+' '+pk.unit,labelStyle));
      if(v!==null) valDict[pollutantKeys[i]]=v;
    }
    showAdvisories(valDict,locLabel+' | '+year);
  });
}

mapPanel.onClick(function(coords){
  var point=ee.Geometry.Point([coords.lon,coords.lat]);
  var locLabel=coords.lat.toFixed(4)+', '+coords.lon.toFixed(4);
  var marker=ui.Map.Layer(
    ee.FeatureCollection([ee.Feature(point)]).style({color:'#ff0055',pointSize:6,width:2}),
    {},'📍 Inspector');
  if(mapPanel.layers().length()>2) mapPanel.layers().set(mapPanel.layers().length()-1,marker);
  else mapPanel.layers().add(marker);
  inspectGeometry(point,locLabel);
});

// ──────────────────────────────────────────────────────────────────────
// 12. DRAWING TOOLS
// ──────────────────────────────────────────────────────────────────────
inspectDrawnBtn.onClick(function(){
  var layers=drawingTools.layers();
  if(layers.length()===0){
    inspectorPanel.clear();inspectorPanel.add(ui.Label('⚠️ No drawings.',{fontSize:'12px',color:'#ffaa00',backgroundColor:PANEL_BG}));return;
  }
  var geom=ee.FeatureCollection(layers.get(0).getEeObject()).union().geometry();
  inspectGeometry(geom,'Drawn Geometry');
});

clearDrawBtn.onClick(function(){
  var layers=drawingTools.layers();
  while(layers.length()>0) layers.remove(layers.get(0));
  drawingTools.addLayer([],'Inspector Drawings','#ff00ff');
  inspectorPanel.clear();advisoryContentPanel.clear();
  advisoryContentPanel.add(ui.Label('Drawings cleared.',mutedStyle));
});

// ──────────────────────────────────────────────────────────────────────
// 13. BUTTON WIRING
// ──────────────────────────────────────────────────────────────────────
updateBtn.onClick(updateMap);

// ──────────────────────────────────────────────────────────────────────
// 13b. CORRELATION HEATMAP
// ──────────────────────────────────────────────────────────────────────
var corrFactorNames = ['NO₂','SO₂','CO','O₃','HCHO','Aerosol','CH₄','LST','Pop','NTL','Wind'];
var corrPalette2 = ['#2166ac','#67a9cf','#d1e5f0','#fddbc7','#ef8a62','#b2182b'];

corrBtn.onClick(function(){
  heatmapPanel.clear();
  heatmapPanel.add(ui.Label('⏳ Computing correlations …',mutedStyle));
  var yr=getSelectedYear();
  var yrs=yr+'-01-01',yre=yr+'-12-31';
  var no2B=annualMean('NO₂ (Nitrogen Dioxide)',yr).rename('NO2');
  var so2B=annualMean('SO₂ (Sulfur Dioxide)',yr).rename('SO2');
  var coB=annualMean('CO (Carbon Monoxide)',yr).rename('CO');
  var o3B=annualMean('O₃ (Ozone)',yr).rename('O3');
  var hchoB=annualMean('HCHO (Formaldehyde)',yr).rename('HCHO');
  var aerB=annualMean('Aerosol Index (UVAI)',yr).rename('Aero');
  var ch4B=annualMean('CH₄ (Methane)',yr).rename('CH4');
  var lstB=ee.ImageCollection('MODIS/061/MOD11A1').filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('LST_Day_1km').mean().multiply(0.02).subtract(273.15).clip(aoiGeom).rename('LST');
  var popB=ee.ImageCollection('WorldPop/GP/100m/pop').filterDate('2020-01-01','2020-12-31')
    .filter(ee.Filter.eq('country','BGD')).mosaic().clip(aoiGeom).rename('Pop');
  var ntlB=ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG').filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('avg_rad').mean().clip(aoiGeom).rename('NTL');
  var u10=ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('u_component_of_wind_10m').mean().clip(aoiGeom);
  var v10=ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').filterDate(yrs,yre).filterBounds(aoiGeom)
    .select('v_component_of_wind_10m').mean().clip(aoiGeom);
  var windB=u10.pow(2).add(v10.pow(2)).sqrt().rename('Wind');
  var multiband=no2B.addBands(so2B).addBands(coB).addBands(o3B)
    .addBands(hchoB).addBands(aerB).addBands(ch4B).addBands(lstB).addBands(popB).addBands(ntlB).addBands(windB);
  var bnames=['NO2','SO2','CO','O3','HCHO','Aero','CH4','LST','Pop','NTL','Wind'];
  var pairs=[];
  for(var ri=0;ri<bnames.length;ri++){
    for(var cci=0;cci<bnames.length;cci++){
      if(ri===cci) pairs.push(ee.Number(1.0));
      else pairs.push(ee.Number(multiband.select([bnames[ri],bnames[cci]])
        .reduceRegion({reducer:ee.Reducer.pearsonsCorrelation(),geometry:getAnalysisGeom(),scale:5000,maxPixels:1e9}).get('correlation')));
    }
  }
  ee.List(pairs).evaluate(function(vals){
    heatmapPanel.clear();
    if(!vals){heatmapPanel.add(ui.Label('Failed.',mutedStyle));return;}
    heatmapPanel.add(ui.Label('Pearson Correlation ('+yr+')',{fontSize:'13px',fontWeight:'bold',color:'#ff79c6',backgroundColor:PANEL_BG}));
    var headerRow=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'2px 0'}});
    headerRow.add(ui.Label('',{width:'42px',backgroundColor:PANEL_BG}));
    for(var h=0;h<corrFactorNames.length;h++){
      headerRow.add(ui.Label(corrFactorNames[h],{fontSize:'7px',width:'26px',color:'#aaa',backgroundColor:PANEL_BG,textAlign:'center',margin:'0'}));
    }
    heatmapPanel.add(headerRow);
    for(var r=0;r<corrFactorNames.length;r++){
      var gridRow=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'0'}});
      gridRow.add(ui.Label(corrFactorNames[r],{fontSize:'7px',width:'42px',color:'#aaa',backgroundColor:PANEL_BG,margin:'0'}));
      for(var c=0;c<corrFactorNames.length;c++){
        var corVal=vals[r*corrFactorNames.length+c];
        var cv=(corVal!==null&&corVal!==undefined)?corVal:0;
        var cIdx=Math.min(5,Math.max(0,Math.round((cv+1)/2*5)));
        gridRow.add(ui.Label(cv.toFixed(2),{fontSize:'6px',width:'26px',height:'16px',
          backgroundColor:corrPalette2[cIdx],color:(cIdx>=2&&cIdx<=3)?'#000':'#fff',textAlign:'center',margin:'0',padding:'1px 0'}));
      }
      heatmapPanel.add(gridRow);
    }
    var scalePnl=ui.Panel({layout:ui.Panel.Layout.flow('horizontal'),style:{backgroundColor:PANEL_BG,margin:'4px 0'}});
    scalePnl.add(ui.Label('-1',{fontSize:'9px',color:'#aaa',backgroundColor:PANEL_BG,margin:'0'}));
    for(var si=0;si<corrPalette2.length;si++){
      scalePnl.add(ui.Label('',{backgroundColor:corrPalette2[si],width:'16px',height:'10px',margin:'0'}));
    }
    scalePnl.add(ui.Label('+1',{fontSize:'9px',color:'#aaa',backgroundColor:PANEL_BG,margin:'0'}));
    heatmapPanel.add(scalePnl);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 14. SPLIT-PANEL COMPARISON MODE
// ──────────────────────────────────────────────────────────────────────
var mapWrapper = ui.Panel({style:{stretch:'both'}});
var splitMapPanel = null;

function enterSplitView() {
  inSplitMode = true;
  exitSplitBtn.style().set('shown', true);

  // Left map: current selection
  var keyL = pollutantSelect.getValue();
  var yearL = getSelectedYear();
  var pL = pollutants[keyL];
  var imgL = annualMean(keyL, yearL);

  // Right map: split selection
  var keyR = splitPollSelect.getValue();
  var yearR = Math.round(splitYearSlider.getValue());
  var pR = pollutants[keyR];
  var imgR = annualMean(keyR, yearR);

  // Clear both maps (keep boundary)
  while(mapPanel.layers().length()>1) mapPanel.layers().remove(mapPanel.layers().get(1));
  while(mapPanel2.layers().length()>1) mapPanel2.layers().remove(mapPanel2.layers().get(1));
  if(currentLegend){try{mapPanel.remove(currentLegend);}catch(e){}}
  if(currentLegend2){try{mapPanel2.remove(currentLegend2);}catch(e){}}

  var labelL = keyL.split(' (')[0]+' – '+yearL;
  var labelR = keyR.split(' (')[0]+' – '+yearR;

  mapPanel.addLayer(imgL,{min:pL.visMin,max:pL.visMax,palette:pL.palette},labelL,true,0.85);
  mapPanel2.addLayer(imgR,{min:pR.visMin,max:pR.visMax,palette:pR.palette},labelR,true,0.85);

  currentLegend = makeGradientLegend(labelL,pL.palette,pL.visMin,pL.visMax,pL.unit,pL.ticks,'bottom-left');
  currentLegend2 = makeGradientLegend(labelR,pR.palette,pR.visMin,pR.visMax,pR.unit,pR.ticks,'bottom-left');
  mapPanel.add(currentLegend);
  mapPanel2.add(currentLegend2);

  // Link maps
  var linker = ui.Map.Linker([mapPanel, mapPanel2]);

  // Build split
  mapWrapper.clear();
  splitMapPanel = ui.SplitPanel({
    firstPanel: mapPanel,
    secondPanel: mapPanel2,
    orientation: 'horizontal',
    wipe: true,
    style:{stretch:'both'}
  });
  mapWrapper.add(splitMapPanel);
}

function exitSplitView() {
  inSplitMode = false;
  exitSplitBtn.style().set('shown', false);
  if(currentLegend2){try{mapPanel2.remove(currentLegend2);}catch(e){}}
  mapWrapper.clear();
  mapWrapper.add(mapPanel);
  updateMap();
}

splitBtn.onClick(enterSplitView);
exitSplitBtn.onClick(exitSplitView);

// ──────────────────────────────────────────────────────────────────────
// 15. COMPOSE APP LAYOUT (fixed right panel)
// ──────────────────────────────────────────────────────────────────────
ui.root.clear();

// Map wrapper starts with single map
mapWrapper.add(mapPanel);

// Centre content: map(s) only — advisory is NOT in a SplitPanel
// Use a horizontal flow panel with fixed-width advisory
var centrePanel = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style:{stretch:'both'}
});

// Map takes remaining space
mapWrapper.style().set({stretch:'both'});
centrePanel.add(mapWrapper);

// Advisory panel fixed on right (no SplitPanel = not draggable)
centrePanel.add(advisoryPanel);

// Outer: sidebar | centre
var outerSplit = ui.SplitPanel({
  firstPanel: sidebar,
  secondPanel: centrePanel,
  orientation: 'horizontal',
  style:{stretch:'both'}
});

ui.root.add(outerSplit);

// ──────────────────────────────────────────────────────────────────────
// 16. INITIAL LOAD
// ──────────────────────────────────────────────────────────────────────
updateMap();

// Multi-year toggleable layers
(function(){
  var key=pollutantKeys[0],p=pollutants[key];
  for(var y=START_YEAR;y<=END_YEAR;y++){
    mapPanel.addLayer(annualMean(key,y),{min:p.visMin,max:p.visMax,palette:p.palette},
      key+' '+y,false,0.75);
  }
})();

print('═══════════════════════════════════════════════════════════');
print('🌬️  AirWatch BD v4.2 loaded successfully');
print('   AOI    : Dhaka City (FAO GAUL Admin-2)');
print('   Admin  : Upazila (ADM3_EN) & Union/Ward (ADM4_EN)');
print('   Assets : projects/thesis-environment-science/assets/');
print('   Data   : Sentinel-5P, ERA5, CHIRPS, MODIS, VIIRS, WorldPop');
print('   Sources: WRI power plants, VIIRS thermal, 24 industry sites');
print('   NEW v4.2: Admin Area Analysis — full pollutant report per');
print('             upazila/union with comparison vs city-wide mean,');
print('             vulnerability gauge, industry exposure count,');
print('             monthly + multi-year trend charts (area vs Dhaka)');
print('═══════════════════════════════════════════════════════════');
