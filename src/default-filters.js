(function exposeDefaultSheetReviewFilters() {
  window.AutoSheetReviewDefaultFilters = [
    {
      id: "default_arena_club_filter",
      name: "ARENA CLUB FILTER",
      rulesSource: "sheet",
      sheetRulesUrl: "",
      defaultVersion: 2,
      rules: []
    },
    {
      id: "default_bgs_filter",
      name: "BGS FILTER",
      rulesSource: "none",
      sheetRulesUrl: "",
      defaultVersion: 1,
      rules: [
        {
          sport: "",
          sportOther: "",
          priceRanges: [{ min: "", max: "" }],
          grades: {
            psa: { allowed: false, min: "", max: "" },
            bgs: { allowed: true, min: "", max: "" },
            sgc: { allowed: false, min: "", max: "" },
            cgc: { allowed: false, min: "", max: "" }
          }
        }
      ]
    },
    {
      id: "default_court_yard_filter",
      name: "COURT YARD FILTER",
      rulesSource: "keep",
      sheetRulesUrl: "",
      defaultVersion: 1,
      rules: []
    },
    {
      id: "default_graded_grails_filter",
      name: "GRADED GRAILS FILTER",
      rulesSource: "sheet",
      sheetRulesUrl: "",
      defaultVersion: 2,
      rules: []
    },
    {
      id: "default_psa_filter",
      name: "PSA FILTER",
      rulesSource: "none",
      sheetRulesUrl: "",
      defaultVersion: 1,
      rules: [
        {
          sport: "",
          sportOther: "",
          priceRanges: [{ min: "0", max: "" }],
          grades: {
            psa: { allowed: true, min: "1", max: "10" },
            bgs: { allowed: false, min: "", max: "" },
            sgc: { allowed: false, min: "", max: "" },
            cgc: { allowed: false, min: "", max: "" }
          }
        }
      ]
    }
  ];

})();
