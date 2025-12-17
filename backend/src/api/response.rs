//! Standardized API response types
//!
//! Provides consistent response structures across all API endpoints.

use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

/// Standard API response wrapper
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    /// Whether the request was successful
    pub success: bool,
    /// Response data (present on success)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    /// Error message (present on failure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ApiError>,
    /// Optional metadata (pagination, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<ResponseMeta>,
}

/// Error details in API response
#[derive(Debug, Serialize, Deserialize)]
pub struct ApiError {
    /// Error code for programmatic handling
    pub code: String,
    /// Human-readable error message
    pub message: String,
    /// Additional error details
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

/// Response metadata (pagination, etc.)
#[derive(Debug, Serialize, Deserialize)]
pub struct ResponseMeta {
    /// Total number of items (for paginated responses)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
    /// Current page number
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page: Option<u32>,
    /// Items per page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_page: Option<u32>,
    /// Total number of pages
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_pages: Option<u32>,
}

impl<T: Serialize> ApiResponse<T> {
    /// Create a successful response with data
    pub fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
            meta: None,
        }
    }

    /// Create a successful response with data and metadata
    pub fn success_with_meta(data: T, meta: ResponseMeta) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
            meta: Some(meta),
        }
    }
}

impl ApiResponse<()> {
    /// Create an error response
    pub fn error(code: impl Into<String>, message: impl Into<String>) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(ApiError {
                code: code.into(),
                message: message.into(),
                details: None,
            }),
            meta: None,
        }
    }

    /// Create an error response with details
    pub fn error_with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: serde_json::Value,
    ) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            error: Some(ApiError {
                code: code.into(),
                message: message.into(),
                details: Some(details),
            }),
            meta: None,
        }
    }
}

/// Pagination parameters from query string
#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    /// Page number (1-indexed, default: 1)
    #[serde(default = "default_page")]
    pub page: u32,
    /// Items per page (default: 20, max: 100)
    #[serde(default = "default_per_page")]
    pub per_page: u32,
}

fn default_page() -> u32 {
    1
}

fn default_per_page() -> u32 {
    20
}

impl PaginationParams {
    /// Get the offset for database queries
    pub fn offset(&self) -> u64 {
        ((self.page.saturating_sub(1)) as u64) * (self.per_page as u64)
    }

    /// Get the limit for database queries (capped at 100)
    pub fn limit(&self) -> u32 {
        self.per_page.min(100)
    }

    /// Create response metadata from pagination params and total count
    pub fn to_meta(&self, total: u64) -> ResponseMeta {
        let per_page = self.limit();
        let total_pages = ((total as f64) / (per_page as f64)).ceil() as u32;
        ResponseMeta {
            total: Some(total),
            page: Some(self.page),
            per_page: Some(per_page),
            total_pages: Some(total_pages),
        }
    }
}

/// Paginated list response
#[derive(Debug, Serialize, Deserialize)]
pub struct PaginatedList<T> {
    pub items: Vec<T>,
}

impl<T: Serialize> IntoResponse for ApiResponse<T> {
    fn into_response(self) -> Response {
        let status = if self.success {
            StatusCode::OK
        } else {
            // Determine status from error code
            match self.error.as_ref().map(|e| e.code.as_str()) {
                Some("NOT_FOUND") => StatusCode::NOT_FOUND,
                Some("BAD_REQUEST") | Some("VALIDATION_ERROR") => StatusCode::BAD_REQUEST,
                Some("UNAUTHORIZED") => StatusCode::UNAUTHORIZED,
                Some("FORBIDDEN") => StatusCode::FORBIDDEN,
                Some("CONFLICT") => StatusCode::CONFLICT,
                _ => StatusCode::INTERNAL_SERVER_ERROR,
            }
        };
        (status, Json(self)).into_response()
    }
}

/// Helper trait for converting results to API responses
pub trait IntoApiResponse<T> {
    fn into_api_response(self) -> ApiResponse<T>;
}

impl<T: Serialize> IntoApiResponse<T> for Result<T, crate::error::AppError> {
    fn into_api_response(self) -> ApiResponse<T> {
        match self {
            Ok(data) => ApiResponse::success(data),
            Err(e) => {
                let (code, message): (&str, String) = match &e {
                    crate::error::AppError::NotFound(msg) => ("NOT_FOUND", msg.clone()),
                    crate::error::AppError::BadRequest(msg) => ("BAD_REQUEST", msg.clone()),
                    crate::error::AppError::Conflict(msg) => ("CONFLICT", msg.clone()),
                    crate::error::AppError::Internal(msg) => ("INTERNAL_ERROR", msg.clone()),
                    crate::error::AppError::Database(err) => ("DATABASE_ERROR", err.to_string()),
                    crate::error::AppError::Kubernetes(err) => ("KUBERNETES_ERROR", err.to_string()),
                    crate::error::AppError::Serialization(err) => ("JSON_ERROR", err.to_string()),
                };
                ApiResponse {
                    success: false,
                    data: None,
                    error: Some(ApiError {
                        code: code.to_string(),
                        message,
                        details: None,
                    }),
                    meta: None,
                }
            }
        }
    }
}
