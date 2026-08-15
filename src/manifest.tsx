import { SMenu, PrimaryTab } from "./typlibs";
import { AppIcons } from "./components/icons";

/** Side sections — always shown from sidenav (Home set is the full menu) */
export const SideMenus: Record<PrimaryTab, SMenu[]> = {
  Home: [
    {
      section: "Launcher",
      options: [
        { label: "Home", icon: AppIcons.Home, primaryTab: "Home" },
        { label: "Discover", icon: AppIcons.Compass, primaryTab: "Home" },
        {
          label: "Updates",
          icon: AppIcons.Newspaper,
          primaryTab: "Home",
        },
      ],
    },
    {
      section: "Library",
      options: [
        { label: "Builds", icon: AppIcons.Builds, primaryTab: "Builds" },
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
        { label: "Activity Feed", icon: AppIcons.Activity, primaryTab: "Guilds" },
        { label: "Find Players", icon: AppIcons.Users, primaryTab: "Guilds" },
        { label: "Forums", icon: AppIcons.Forums, primaryTab: "Guilds" },
      ],
    },
    {
      section: "Account",
      options: [
        { label: "Friends", icon: AppIcons.Users, primaryTab: "Home" },
        {
          label: "Discord",
          icon: AppIcons.Discord,
          primaryTab: "Home",
        },
        { label: "Settings", icon: AppIcons.Settings, primaryTab: "Home" },
      ],
    },
  ],
  Builds: [
    {
      section: "Library",
      options: [
        { label: "Builds", icon: AppIcons.Builds, primaryTab: "Builds" },
        { label: "Library", icon: AppIcons.Mods, primaryTab: "Mods" },
      ],
    },
  ],
  Guilds: [
    {
      section: "Community",
      options: [
        { label: "Guilds", icon: AppIcons.Guilds, primaryTab: "Guilds" },
        { label: "Activity Feed", icon: AppIcons.Activity, primaryTab: "Guilds" },
        { label: "Find Players", icon: AppIcons.Users, primaryTab: "Guilds" },
        { label: "Forums", icon: AppIcons.Forums, primaryTab: "Guilds" },
      ],
    },
  ],
  Mods: [
    {
      section: "Library",
      options: [
        { label: "Builds", icon: AppIcons.Builds, primaryTab: "Builds" },
        { label: "Library", icon: AppIcons.Mods, primaryTab: "Mods" },
      ],
    },
  ],
  Servers: [
    {
      section: "Servers",
      options: [
        { label: "Browse", icon: AppIcons.Servers, primaryTab: "Servers" },
        { label: "Favorites", icon: AppIcons.Activity, primaryTab: "Servers" },
        { label: "Recent", icon: AppIcons.Newspaper, primaryTab: "Servers" },
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
  "Builds",
  "Guilds",
  "Mods",
  "Servers",
  "Store",
];

export const DefaultConfig: Object = {};

export const APP_VERSION = "2.4 Generation 2";
