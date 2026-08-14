import os
import boto3
from botocore.config import Config
from app.utils.logger import log_info, log_error

# Load environment configuration
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "atlas-ai-os-storage")

LOCAL_STORAGE_DIR = "local_r2_storage"

class LocalFileStorageClient:
    def __init__(self, storage_dir: str = LOCAL_STORAGE_DIR):
        self.storage_dir = storage_dir
        try:
            os.makedirs(self.storage_dir, exist_ok=True)
            log_info(f"Initialized Local Storage Client. Assets will be saved in: {os.path.abspath(self.storage_dir)}")
        except OSError:
            # Serverless / read-only filesystem environment (e.g. Vercel)
            self.storage_dir = os.path.join("/tmp", "local_r2_storage")
            try:
                os.makedirs(self.storage_dir, exist_ok=True)
                log_info(f"Initialized Fallback Local Storage Client in /tmp: {os.path.abspath(self.storage_dir)}")
            except Exception as e:
                log_error("Could not create local storage directory even in /tmp", exc=e)

    def upload_file(self, file_content: bytes, file_name: str, content_type: str = None) -> str:
        # Avoid directories injection
        safe_name = os.path.basename(file_name)
        target_path = os.path.join(self.storage_dir, safe_name)
        with open(target_path, "wb") as f:
            f.write(file_content)
        # Return a local relative URL that we can expose via FastAPI static mount
        return f"/api/static/{safe_name}"

    def download_file(self, file_name: str) -> bytes:
        safe_name = os.path.basename(file_name)
        target_path = os.path.join(self.storage_dir, safe_name)
        if not os.path.exists(target_path):
            raise FileNotFoundError(f"File not found in local storage: {file_name}")
        with open(target_path, "rb") as f:
            return f.read()

    def delete_file(self, file_name: str) -> None:
        safe_name = os.path.basename(file_name)
        target_path = os.path.join(self.storage_dir, safe_name)
        if os.path.exists(target_path):
            os.remove(target_path)
            log_info(f"Deleted local asset: {safe_name}")

    def get_preview_url(self, file_name: str) -> str:
        return f"/api/static/{os.path.basename(file_name)}"


class R2StorageClient:
    def __init__(self):
        self.bucket_name = R2_BUCKET_NAME
        r2_config = Config(
            retries = {
                'max_attempts': 3,
                'mode': 'standard'
            }
        )
        self.s3_client = boto3.client(
            service_name='s3',
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=r2_config
        )
        log_info("Cloudflare R2 Storage S3 client initialized.")

    def upload_file(self, file_content: bytes, file_name: str, content_type: str = None) -> str:
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
            
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=file_name,
            Body=file_content,
            **extra_args
        )
        # R2 assets are usually served through a custom domain or standard URL structure
        return f"{R2_ENDPOINT_URL}/{self.bucket_name}/{file_name}"

    def download_file(self, file_name: str) -> bytes:
        response = self.s3_client.get_object(Bucket=self.bucket_name, Key=file_name)
        return response['Body'].read()

    def delete_file(self, file_name: str) -> None:
        self.s3_client.delete_object(Bucket=self.bucket_name, Key=file_name)

    def get_preview_url(self, file_name: str) -> str:
        # Pre-signed download URL or simple asset link
        try:
            return self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': file_name},
                ExpiresIn=3600
            )
        except Exception as e:
            log_error("Failed to generate presigned URL for R2 asset", exc=e)
            return f"{R2_ENDPOINT_URL}/{self.bucket_name}/{file_name}"


# Instantiate storage client based on available config
storage_client = None

if R2_ENDPOINT_URL and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY:
    try:
        client = R2StorageClient()
        # Verify connection by calling a fast, lightweight API
        client.s3_client.list_buckets()
        storage_client = client
        log_info("Cloudflare R2 verified and connected successfully.")
    except Exception as e:
        log_error("Failed to connect to Cloudflare R2. Falling back to local storage.", exc=e)

if storage_client is None:
    storage_client = LocalFileStorageClient()

def get_storage():
    """Dependency injection helper for file storage."""
    return storage_client
