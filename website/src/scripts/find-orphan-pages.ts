// Get all markdown files
import path from 'path';
import fs from 'fs';
import markdownLinkExtractor from 'markdown-link-extractor';
import sidebars from '../../sidebars';
import { SidebarItemConfig } from '@docusaurus/plugin-content-docs/src/sidebars/types';

// Constants and arrays needed
const docsRoot = '../arbitrum-docs';
const resources = [];
const dirsAutogeneratedInSidebar = [];
const resourcesLinkedInSidebar = [];
const resourcesLinkedInDocs = [];
const resourcesImportedInDocs = [];

// Analyzes a sidebar item and get the resources if it can
const getResourcesFromSidebarItem = (sidebarItem: SidebarItemConfig) => {
  if (typeof sidebarItem == 'string') {
    console.warn('String detected in sidebar item: ' + sidebarItem);
    return;
  }

  switch (sidebarItem.type) {
    // Item is a category, we traverse that again
    case 'category':
      if (!sidebarItem.items) {
        console.warn('Sidebar item of type category does not have items: ' + sidebarItem);
        return;
      }
      getResourcesFromSidebarObj(sidebarItem.items as SidebarItemConfig[]);
      break;

    // Item is a resource
    case 'doc':
      const resourcePath = '/' + sidebarItem.id;
      resourcesLinkedInSidebar.push(resourcePath);
      break;

    // Item is an autogenerated category
    case 'autogenerated':
      if (!sidebarItem.dirName) {
        console.warn('Sidebar item of type autogenerated does not have a dirName: ' + sidebarItem);
        return;
      }
      dirsAutogeneratedInSidebar.push('/' + sidebarItem.dirName);
      break;

    // Item is a link
    case 'link':
      // Not needed
      break;

    // Other types of item?
    default:
      console.warn('Detected unhandled type on sidebar item: ' + sidebarItem.type);
      return;
  }
};

// Recursive function for traversing nested categories
const getResourcesFromSidebarObj = (sidebar: SidebarItemConfig[]) => {
  sidebar.forEach((sidebarItem: SidebarItemConfig) => {
    getResourcesFromSidebarItem(sidebarItem);
  });
};

// Extracts all resources in the sidebar
const extractResourcesLinkedInSidebar = () => {
  if (!sidebars || Object.keys(sidebars).length <= 0) {
    return;
  }

  // Sidebar types can be SidebarCategoriesShorthand | SidebarItemConfig[]
  // We only need the second
  Object.values(sidebars).forEach((sidebar) => {
    if (!sidebar || !sidebar.length) {
      return;
    }

    getResourcesFromSidebarObj(sidebar as SidebarItemConfig[]);
  });
};

// Gets the full path to a resource starting from the arbitrum-docs folder (not included)
// "originFilePath" is the path to the file that contains this "link"
const getFullPathToResource = (link: string, originFilePath: string) => {
  // Resource is in the same folder as the originFilePath
  if (link.startsWith('./')) {
    const rootPathElements = originFilePath.split('/');
    rootPathElements.pop();
    link =
      (rootPathElements.length > 1 ? rootPathElements.join('/') + '/' : '/') + link.substring(2);
  }

  // Resource is in an ancestor folder of the originFilePath
  if (link.startsWith('../')) {
    const rootPathElements = originFilePath.split('/');
    const backMoves = link.split('../').length - 1;

    // Removing the file in the path and then moving to the right ancestor
    rootPathElements.pop();
    for (let i = 0; i < backMoves; i++) {
      rootPathElements.pop();
    }

    link =
      (rootPathElements.length > 1 ? rootPathElements.join('/') + '/' : '/') +
      link.substring(3 * backMoves);
  }

  // Some links do not start with '/', so we add it for coherence
  if (!link.startsWith('/')) {
    link = '/' + link;
  }

  // We also remove the extension if it exists
  link = link.replace('.mdx', '').replace('.md', '');

  return link;
};

// Extract all internal links from a MD file
// Using markdown-link-extractor: https://www.npmjs.com/package/markdown-link-extractor
const extractLinksFromMdFile = (filePath: string) => {
  const markdown = fs.readFileSync(filePath, { encoding: 'utf8' });
  const { links } = markdownLinkExtractor(markdown);

  // Extracted links
  links.forEach((link: string) => {
    // Remove final anchors
    if (link.includes('#') && !link.startsWith('#')) {
      link = link.split('#')[0];
    }

    // Detecting path
    if (link.startsWith('https://developer.offchainlabs.com')) {
      // OLD internal absolute link (we remove the domain)
      link = link.split('offchainlabs.com')[1];
    } else if (
      ['https://developer.arbitrum.io', 'https://docs.arbitrum.io'].some((prefix) =>
        link.startsWith(prefix),
      )
    ) {
      // Internal absolute link (we remove the domain)
      link = link.split('arbitrum.io')[1];
    } else if (['http://', 'https://'].some((prefix) => link.startsWith(prefix))) {
      // External link (not needed)
      return;
    } else if (link.includes(':')) {
      // Some pointers to resources of a specific type like "tiff" or "exif" (not needed)
      return;
    } else if (link.startsWith('@')) {
      // URL saved in a variable (not needed)
      return;
    } else if (!link.startsWith('#')) {
      // Internal relative URL
    } else {
      // Anchor (not needed)
      return;
    }

    // Getting full path to resource (starting from the arbitrum-docs folder)
    const resourceFullPath = getFullPathToResource(link, filePath.replace('../arbitrum-docs', ''));

    // Avoid duplicates
    if (!resourcesLinkedInDocs.includes(resourceFullPath)) {
      resourcesLinkedInDocs.push(resourceFullPath);
    }
  });

  // Also detecting the imported files (thanks GPT)
  const importPathRegex = /import\s+[a-zA-Z_]\w+\s+from\s+'(?<path>.+\.mdx?)';/g;
  let match: RegExpExecArray | null;

  // Iterate over each match found in the content
  while ((match = importPathRegex.exec(markdown)) !== null) {
    // Extract the captured path of the resource
    const resourcePath = match.groups!.path;

    // Getting full path to resource (starting from the arbitrum-docs folder)
    const resourceFullPath = getFullPathToResource(
      resourcePath,
      filePath.replace('../arbitrum-docs', ''),
    );

    // Avoid duplicates
    if (!resourcesImportedInDocs.includes(resourceFullPath)) {
      resourcesImportedInDocs.push(resourceFullPath);
    }
  }
};

// Get all resources available and links inside them (recursive for subdirectories)
const getResourcePathsAndLinks = (dir: string) => {
  // Traverse all files/directories in a specific directory
  //  - If it's a subdirectory, call this function again
  //  - If it's a file, extract links from the file, and save it as a resource
  fs.readdirSync(dir).forEach((file) => {
    const elementPath = path.join(dir, file);
    if (fs.lstatSync(elementPath).isDirectory()) {
      getResourcePathsAndLinks(elementPath);
    } else {
      resources.push(
        elementPath.replace('../arbitrum-docs', '').replace('.mdx', '').replace('.md', ''),
      );
      extractLinksFromMdFile(elementPath);
    }
  });
};

// Get resources available (resources) and all linked resources (resourcesLinkedInDocs)
getResourcePathsAndLinks(docsRoot);

// Get resources linked in sidebar
extractResourcesLinkedInSidebar();

// Detect orphan resources
const orphanResources = [];
resources.forEach((resourcePath: string) => {
  if (
    !dirsAutogeneratedInSidebar.some((autogeneratedDir) =>
      resourcePath.startsWith(autogeneratedDir),
    ) &&
    !resourcesLinkedInSidebar.includes(resourcePath) &&
    !resourcesImportedInDocs.includes(resourcePath) &&
    (!resourcePath.endsWith('.png') || !resourcesLinkedInDocs.includes(resourcePath))
  ) {
    orphanResources.push(resourcePath);
  }
});

if (orphanResources.length > 0) {
  console.error('Found orphan resources:');
  orphanResources.forEach((resource) => console.log(resource));

  process.exit(1);
} else {
  process.exit(0);
}
