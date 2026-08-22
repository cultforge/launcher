import { SMenu, PrimaryTab } from "./typlibs";

import { AppIcons } from "./components/icons";

import { HOME_BUILDS_SIDE } from "./lib/homeNav";



const homeSideNav: SMenu[] = [

  {

    section: "Home",

    options: [

      { label: HOME_BUILDS_SIDE, icon: AppIcons.Builds, primaryTab: "Home" },

      { label: "Library", icon: AppIcons.Mods, primaryTab: "Mods" },

    ],

  },

  {

    section: "Community",

    options: [

      {

        label: "Guilds",

        icon: AppIcons.Guilds,

        primaryTab: "Guilds",

        badge: "NEW",

      },

    ],

  },

  {

    section: "You",

    options: [

      { label: "Friends", icon: AppIcons.Users, primaryTab: "Home" },

      { label: "Discord", icon: AppIcons.Discord, primaryTab: "Home" },

      { label: "Settings", icon: AppIcons.Settings, primaryTab: "Home" },

    ],

  },

];



/** Side sections — Home tab uses builds hub nav; header owns Guilds, Mods, Servers, Store. */

export const SideMenus: Record<PrimaryTab, SMenu[]> = {

  Home: homeSideNav,

  Builds: homeSideNav,

  Guilds: [

    {

      section: "Community",

      options: [

        { label: "Guilds", icon: AppIcons.Guilds, primaryTab: "Guilds" },

      ],

    },

  ],

  Mods: [

    {

      section: "Home",

      options: [

        { label: HOME_BUILDS_SIDE, icon: AppIcons.Builds, primaryTab: "Home" },

        { label: "Library", icon: AppIcons.Mods, primaryTab: "Mods" },

      ],

    },

  ],

  Servers: [

    {

      section: "Servers",

      options: [

        { label: "All", icon: AppIcons.Servers, primaryTab: "Servers" },

        { label: "My PCs", icon: AppIcons.Activity, primaryTab: "Servers" },

        { label: "My Servers", icon: AppIcons.Globe, primaryTab: "Servers" },

      ],

    },

  ],

  Store: [],

  Admin: [],

};



/** @deprecated use SideMenus */

export const MenuItems: SMenu[] = SideMenus.Home;



export const HeaderTabs: PrimaryTab[] = [

  "Home",

  "Guilds",

  "Mods",

  "Servers",

  "Store",

];



export const DefaultConfig: Object = {};



export const APP_VERSION = "2.4.1";

