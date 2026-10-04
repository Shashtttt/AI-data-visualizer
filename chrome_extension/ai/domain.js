/**
 * ai/domain.js
 * Browser-native Domain & Industry Taxonomy Engine for AetherBI
 * Detects domain/industry from column names, sample values, and structure.
 * Influences chart recommendations, statistical metrics, ML suggestions, and AI interpretation.
 */

const DomainTaxonomy = {
  TAXONOMIES: {
    general: {
      id: 'general',
      title: 'General Dataset',
      icon: '📊',
      description: 'Standard exploratory data analysis and predictive modeling',
      keywords: ['data', 'item', 'record', 'value', 'code', 'category', 'status', 'description', 'type'],
      recommendedCharts: ['bar', 'pie', 'histogram', 'scatter'],
      recommendedTask: 'classification'
    },
    sales: {
      id: 'sales',
      title: 'Sales & E-Commerce',
      icon: '🛍️',
      description: 'Revenue, orders, products, discounts, and customer purchasing patterns',
      keywords: [
        'sales', 'revenue', 'product', 'customer', 'price', 'unit_price', 'units_sold',
        'discount', 'profit', 'order', 'cost', 'margin', 'region', 'channel', 'transaction',
        'quota', 'commission', 'pipeline', 'lead', 'gross', 'net', 'invoice', 'cart',
        'checkout', 'shipping', 'purchase', 'billing', 'retail', 'ecommerce', 'e-commerce'
      ],
      primaryMetrics: ['revenue', 'sales', 'profit', 'units_sold', 'margin', 'discount'],
      dimensionKeywords: ['region', 'category', 'product', 'channel', 'customer_segment', 'sales_rep'],
      recommendedCharts: ['bar', 'horizontal_bar', 'line', 'forecast', 'scatter'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['sales', 'revenue', 'profit', 'margin', 'units_sold'],
        classificationTarget: ['churn', 'status', 'channel', 'customer_segment', 'payment_status']
      }
    },
    finance: {
      id: 'finance',
      title: 'Finance & Banking',
      icon: '🏦',
      description: 'Credit scores, loans, balances, default risk, and portfolio metrics',
      keywords: [
        'revenue', 'profit', 'loss', 'interest', 'rate', 'inflation', 'stock', 'investment',
        'loan', 'credit', 'debt', 'income', 'expense', 'tax', 'gdp', 'market', 'portfolio',
        'dividend', 'equity', 'liability', 'asset', 'balance', 'default', 'borrower',
        'credit_score', 'yield', 'deposit', 'mortgage', 'delinquency', 'apr', 'cash_flow', 'risk'
      ],
      primaryMetrics: ['balance', 'loan_amount', 'interest_rate', 'income', 'credit_score', 'debt_ratio'],
      dimensionKeywords: ['account_type', 'loan_grade', 'risk_category', 'branch', 'currency'],
      recommendedCharts: ['line', 'box', 'correlation_heatmap', 'histogram', 'scatter'],
      recommendedTask: 'classification',
      mlSuggestions: {
        regressionTarget: ['loan_amount', 'balance', 'income', 'profit'],
        classificationTarget: ['default', 'risk_category', 'loan_grade', 'approved', 'status']
      }
    },
    healthcare: {
      id: 'healthcare',
      title: 'Healthcare & Clinical Medicine',
      icon: '🏥',
      description: 'Patients, diagnoses, vitals, medical treatments, and clinical outcomes',
      keywords: [
        'patient', 'diagnosis', 'disease', 'symptom', 'bmi', 'blood_pressure', 'blood',
        'pressure', 'cholesterol', 'age', 'hospital', 'medicine', 'treatment', 'readmission',
        'mortality', 'clinical', 'glucose', 'insulin', 'pulse', 'heartrate', 'heart_rate',
        'doctor', 'clinic', 'surgery', 'stay', 'discharge', 'vital', 'lab', 'therapy',
        'ward', 'icu', 'inpatient', 'outpatient', 'triage', 'creatinine', 'hemoglobin'
      ],
      primaryMetrics: ['glucose', 'bmi', 'blood_pressure', 'cholesterol', 'stay_duration', 'pulse'],
      dimensionKeywords: ['diagnosis', 'treatment', 'gender', 'age_group', 'department', 'outcome'],
      recommendedCharts: ['box', 'histogram', 'scatter', 'bar'],
      recommendedTask: 'classification',
      mlSuggestions: {
        regressionTarget: ['stay_duration', 'glucose', 'bmi', 'blood_pressure', 'cost'],
        classificationTarget: ['diagnosis', 'outcome', 'readmission', 'mortality', 'disease']
      }
    },
    hr: {
      id: 'hr',
      title: 'Human Resources & Workforce',
      icon: '👥',
      description: 'Employee attrition, compensation, performance appraisals, and retention',
      keywords: [
        'employee', 'attrition', 'salary', 'department', 'job_role', 'tenure', 'performance',
        'turnover', 'satisfaction', 'overtime', 'leave', 'promotion', 'work_life_balance',
        'manager', 'compensation', 'bonus', 'rating', 'experience', 'retention', 'headcount',
        'payroll', 'appraisal', 'engagement', 'resignation', 'recruitment', 'hire_date'
      ],
      primaryMetrics: ['salary', 'performance_score', 'satisfaction_level', 'tenure', 'overtime_hours'],
      dimensionKeywords: ['department', 'job_role', 'gender', 'education', 'performance_rating'],
      recommendedCharts: ['bar', 'box', 'scatter', 'horizontal_bar', 'radar'],
      recommendedTask: 'classification',
      mlSuggestions: {
        regressionTarget: ['salary', 'performance_score', 'satisfaction_level', 'tenure'],
        classificationTarget: ['attrition', 'department', 'promotion', 'performance_rating', 'turnover']
      }
    },
    education: {
      id: 'education',
      title: 'Education & Academic Analytics',
      icon: '🎓',
      description: 'Student performance, GPA, exams, attendance, and graduation trajectories',
      keywords: [
        'student', 'grade', 'gpa', 'score', 'exam', 'attendance', 'marks', 'course',
        'teacher', 'school', 'university', 'pass', 'fail', 'homework', 'test', 'quiz',
        'degree', 'study', 'subject', 'math', 'science', 'english', 'semester', 'credits'
      ],
      primaryMetrics: ['final_grade', 'gpa', 'attendance_rate', 'score', 'marks'],
      dimensionKeywords: ['grade_level', 'major', 'subject', 'school', 'gender', 'status'],
      recommendedCharts: ['histogram', 'box', 'bar', 'scatter'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['final_grade', 'gpa', 'score', 'marks'],
        classificationTarget: ['pass', 'fail', 'grade_level', 'status', 'result']
      }
    },
    marketing: {
      id: 'marketing',
      title: 'Marketing & Campaigns',
      icon: '📈',
      description: 'Campaign conversion rates, impressions, clicks, leads, and customer acquisition',
      keywords: [
        'campaign', 'clicks', 'impressions', 'ctr', 'cpc', 'cpa', 'conversion', 'leads',
        'channel', 'ad_spend', 'spend', 'roas', 'roi', 'bounce_rate', 'traffic', 'visitor',
        'engagement', 'newsletter', 'subscriber', 'acquisition', 'utm_source', 'medium'
      ],
      primaryMetrics: ['clicks', 'impressions', 'conversion_rate', 'spend', 'roas', 'cpc'],
      dimensionKeywords: ['campaign', 'channel', 'medium', 'ad_group', 'device', 'country'],
      recommendedCharts: ['line', 'bar', 'area', 'scatter'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['spend', 'roas', 'conversion_rate', 'clicks'],
        classificationTarget: ['converted', 'channel', 'campaign_status']
      }
    },
    inventory: {
      id: 'inventory',
      title: 'Supply Chain & Inventory',
      icon: '📦',
      description: 'Stock levels, warehousing, reorder points, suppliers, and fulfillment cycles',
      keywords: [
        'inventory', 'stock', 'warehouse', 'reorder', 'lead_time', 'supplier', 'sku',
        'holding_cost', 'turnover', 'backorder', 'logistics', 'fulfillment', 'shipping',
        'freight', 'delivery', 'pallet', 'cargo', 'shelf_life', 'stockout', 'batch'
      ],
      primaryMetrics: ['stock_level', 'lead_time', 'holding_cost', 'reorder_point', 'turnover_rate'],
      dimensionKeywords: ['warehouse', 'supplier', 'sku', 'category', 'shipping_mode'],
      recommendedCharts: ['bar', 'line', 'forecast', 'box'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['stock_level', 'lead_time', 'reorder_point', 'turnover_rate'],
        classificationTarget: ['stockout', 'supplier', 'status', 'warehouse']
      }
    },
    automotive: {
      id: 'automotive',
      title: 'Automotive & Fleet',
      icon: '🚗',
      description: 'Vehicles, fuel efficiency, horsepower, engine specifications, and pricing',
      keywords: [
        'car', 'vehicle', 'fuel', 'mileage', 'engine', 'model', 'transmission',
        'horsepower', 'price', 'dealer', 'brand', 'sedan', 'suv', 'electric', 'hybrid',
        'mpg', 'displacement', 'wheelbase', 'curb_weight', 'odometer', 'vin', 'speed', 'battery'
      ],
      primaryMetrics: ['price', 'horsepower', 'mpg', 'fuel_efficiency', 'mileage', 'engine_size'],
      dimensionKeywords: ['manufacturer', 'model', 'transmission', 'fuel_type', 'vehicle_type'],
      recommendedCharts: ['scatter', 'trend_scatter', 'box', 'bar'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['price', 'mpg', 'horsepower', 'mileage'],
        classificationTarget: ['fuel_type', 'transmission', 'vehicle_type', 'brand']
      }
    },
    real_estate: {
      id: 'real_estate',
      title: 'Real Estate & Property',
      icon: '🏡',
      description: 'Property valuations, square footage, bedrooms, locations, and rental yields',
      keywords: [
        'property', 'house', 'home', 'apartment', 'price', 'rent', 'bedroom', 'bathroom',
        'sqft', 'square_feet', 'area', 'zip_code', 'neighborhood', 'mortgage', 'listing',
        'lot_size', 'year_built', 'stories', 'real_estate', 'tenant', 'landlord', 'yield'
      ],
      primaryMetrics: ['price', 'rent', 'sqft', 'price_per_sqft', 'bedrooms', 'bathrooms'],
      dimensionKeywords: ['neighborhood', 'property_type', 'city', 'zip_code', 'status'],
      recommendedCharts: ['scatter', 'trend_scatter', 'bar', 'box'],
      recommendedTask: 'regression',
      mlSuggestions: {
        regressionTarget: ['price', 'rent', 'sqft'],
        classificationTarget: ['property_type', 'status', 'city', 'neighborhood']
      }
    },
    customer_analytics: {
      id: 'customer_analytics',
      title: 'Customer Analytics & Retention',
      icon: '🎯',
      description: 'Customer churn, lifetime value (LTV), satisfaction, Net Promoter Score (NPS)',
      keywords: [
        'customer', 'client', 'churn', 'retention', 'ltv', 'lifetime_value', 'nps',
        'csat', 'satisfaction', 'tenure', 'contract', 'subscription', 'monthly_charges',
        'total_charges', 'support_tickets', 'tier', 'plan', 'loyalty', 'referral'
      ],
      primaryMetrics: ['monthly_charges', 'total_charges', 'tenure', 'ltv', 'satisfaction_score'],
      dimensionKeywords: ['contract', 'payment_method', 'tier', 'churn', 'gender', 'plan'],
      recommendedCharts: ['bar', 'pie', 'box', 'scatter'],
      recommendedTask: 'classification',
      mlSuggestions: {
        regressionTarget: ['monthly_charges', 'total_charges', 'tenure', 'ltv'],
        classificationTarget: ['churn', 'contract', 'tier', 'payment_method']
      }
    }
  },

  /**
   * Automatically detect domain/industry from dataset columns, rows, and dataset name.
   */
  detectDomain(columns = [], rows = [], datasetName = '') {
    if (!columns || !columns.length) {
      return { ...this.TAXONOMIES.general, confidence: 100, isDetected: false };
    }

    const nameStr = (datasetName || '').toLowerCase().replace(/[-_]/g, ' ');
    const colsStr = columns.map(c => c.toLowerCase().replace(/[-_]/g, ' ')).join(' ');

    // Sample tokens from text cells
    const sampleTokens = [];
    const sampleRows = (rows || []).slice(0, 10);
    sampleRows.forEach(r => {
      columns.forEach(c => {
        const v = r[c];
        if (typeof v === 'string' && v.length < 35 && !v.match(/^\d+$/)) {
          sampleTokens.push(v.toLowerCase());
        }
      });
    });
    const corpusText = `${nameStr} ${colsStr} ${sampleTokens.slice(0, 50).join(' ')}`;

    let bestDomain = 'general';
    let maxScore = 0;
    const scores = {};

    Object.entries(this.TAXONOMIES).forEach(([key, tax]) => {
      if (key === 'general') return;
      let score = 0;

      // Check keywords
      tax.keywords.forEach(kw => {
        const kwClean = kw.replace(/_/g, ' ');
        // Check in column names (high weight = 4)
        columns.forEach(c => {
          const colClean = c.toLowerCase().replace(/[-_]/g, ' ');
          if (colClean === kwClean) score += 4;
          else if (colClean.includes(kwClean) || kwClean.includes(colClean)) score += 2;
        });

        // Check in dataset name (weight = 3)
        if (nameStr.includes(kwClean)) score += 3;

        // Check in sample text (weight = 0.5)
        if (corpusText.includes(kwClean)) score += 0.5;
      });

      scores[key] = score;
      if (score > maxScore) {
        maxScore = score;
        bestDomain = key;
      }
    });

    if (maxScore < 2) {
      const generalTax = this.TAXONOMIES.general;
      return {
        ...generalTax,
        domain: 'general',
        info: generalTax,
        confidence: 60,
        isDetected: false,
        scores
      };
    }

    const confidence = Math.min(98, Math.round(50 + maxScore * 5));
    const bestTax = this.TAXONOMIES[bestDomain];
    return {
      ...bestTax,
      domain: bestDomain,
      info: bestTax,
      confidence,
      isDetected: true,
      scores
    };
  },

  getAllTaxonomies() {
    return Object.values(this.TAXONOMIES);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomainTaxonomy;
}
