const { executeShopifyGraphQL, ShopifyGraphQLError } = require('../utils/shopifyGql');
const logger = require('../utils/logger');

const STAGED_UPLOADS_MUTATION = `
  mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE_MUTATION = `
  mutation FileCreate($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        createdAt
        ... on MediaImage {
          image {
            url
            originalSrc
          }
        }
        ... on GenericFile {
          url
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_QUERY = `
  query GetFileDetails($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        id
        fileStatus
        image {
          url
          originalSrc
        }
      }
      ... on GenericFile {
        id
        fileStatus
        url
      }
    }
  }
`;

/**
 * Creates a staged upload target on Shopify.
 *
 * @param {object} params
 * @param {string} params.shop
 * @param {string} params.accessToken
 * @param {string} params.filename
 * @param {string} params.mimeType
 * @param {'IMAGE'|'FILE'} params.resource
 * @param {number} params.fileSize
 * @returns {Promise<{ url: string, resourceUrl: string, parameters: Array<{name: string, value: string}> }>}
 */
async function createStagedUpload({ shop, accessToken, filename, mimeType, resource = 'IMAGE', fileSize }) {
  const input = [
    {
      filename,
      mimeType,
      resource,
      fileSize: String(fileSize),
      httpMethod: 'POST'
    }
  ];

  const data = await executeShopifyGraphQL({
    shop,
    accessToken,
    query: STAGED_UPLOADS_MUTATION,
    variables: { input }
  });

  const { stagedTargets, userErrors } = data.stagedUploadsCreate;

  if (userErrors && userErrors.length > 0) {
    const errorMsg = userErrors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('; ');
    throw new ShopifyGraphQLError(`Shopify stagedUploadsCreate failed: ${errorMsg}`, userErrors);
  }

  if (!stagedTargets || stagedTargets.length === 0) {
    throw new Error('Shopify did not return staged upload targets');
  }

  return stagedTargets[0];
}

/**
 * Posts binary file buffer to Shopify's staged upload target (S3/GCS bucket).
 *
 * @param {object} params
 * @param {string} params.url
 * @param {Array<{name: string, value: string}>} params.parameters
 * @param {Buffer} params.buffer
 * @param {string} params.filename
 * @param {string} params.mimeType
 */
async function uploadToStagedTarget({ url, parameters, buffer, filename, mimeType }) {
  // Construct standard multipart/form-data
  const formData = new FormData();

  // Shopify requires parameters to be added in order before the file
  for (const param of parameters) {
    formData.append(param.name, param.value);
  }

  // Append file blob
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, filename);

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  // Most cloud storage targets return 200, 201, or 204 on success
  if (!response.ok && response.status !== 201 && response.status !== 204) {
    const errorText = await response.text();
    logger.error('Failed to upload file to Shopify staged target', {
      status: response.status,
      body: errorText
    });
    throw new Error(`Failed to upload file to Shopify storage: HTTP ${response.status} - ${errorText}`);
  }
}

/**
 * Creates permanent Shopify File in the Files library from staged resourceUrl.
 *
 * @param {object} params
 * @param {string} params.shop
 * @param {string} params.accessToken
 * @param {string} params.resourceUrl
 * @param {'IMAGE'|'FILE'} params.contentType
 * @param {string} [params.alt]
 * @returns {Promise<{ id: string, url: string, fileStatus: string }>}
 */
async function createShopifyFile({ shop, accessToken, resourceUrl, contentType = 'IMAGE', alt = '' }) {
  const filesInput = [
    {
      originalSource: resourceUrl,
      contentType,
      alt
    }
  ];

  const data = await executeShopifyGraphQL({
    shop,
    accessToken,
    query: FILE_CREATE_MUTATION,
    variables: { files: filesInput }
  });

  const { files, userErrors } = data.fileCreate;

  if (userErrors && userErrors.length > 0) {
    const errorMsg = userErrors.map((e) => `${e.field ? e.field + ': ' : ''}${e.message}`).join('; ');
    throw new ShopifyGraphQLError(`Shopify fileCreate failed: ${errorMsg}`, userErrors);
  }

  if (!files || files.length === 0) {
    throw new Error('Shopify did not return created file record');
  }

  const file = files[0];
  let fileUrl = file.image ? (file.image.url || file.image.originalSrc) : file.url;

  // If URL is not immediately populated because Shopify is processing, fallback to resourceUrl
  if (!fileUrl) {
    fileUrl = resourceUrl;
  }

  return {
    id: file.id,
    url: fileUrl,
    fileStatus: file.fileStatus
  };
}

/**
 * High-level helper: complete end-to-end upload of a buffer to Shopify Files.
 *
 * @param {object} params
 * @param {string} params.shop
 * @param {string} params.accessToken
 * @param {Buffer} params.buffer
 * @param {string} params.filename
 * @param {string} params.mimeType
 * @param {'IMAGE'|'FILE'} [params.resource='IMAGE']
 * @param {string} [params.alt='']
 * @returns {Promise<{ id: string, url: string, fileStatus: string }>}
 */
async function uploadBufferToShopifyFiles({
  shop,
  accessToken,
  buffer,
  filename,
  mimeType,
  resource = 'IMAGE',
  alt = ''
}) {
  // Step 1: Request Staged Target
  const target = await createStagedUpload({
    shop,
    accessToken,
    filename,
    mimeType,
    resource,
    fileSize: buffer.length
  });

  // Step 2: Push binary data to storage target
  await uploadToStagedTarget({
    url: target.url,
    parameters: target.parameters,
    buffer,
    filename,
    mimeType
  });

  // Step 3: Register File record in Shopify
  const createdFile = await createShopifyFile({
    shop,
    accessToken,
    resourceUrl: target.resourceUrl,
    contentType: resource,
    alt
  });

  return createdFile;
}

module.exports = {
  createStagedUpload,
  uploadToStagedTarget,
  createShopifyFile,
  uploadBufferToShopifyFiles
};

